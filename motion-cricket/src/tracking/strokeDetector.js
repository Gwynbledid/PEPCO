// Turns the bat's position over time into "strokes": continuous bursts of
// movement, each with a start, a peak speed, a direction and a length.
//
// Only a real swing counts:
//  - it must be fast (peak speed a good fraction of the player's own full
//    swing, measured in calibration),
//  - and long (the bat has to travel a real distance: nudging it to one
//    side is not a swing),
//  - and a backlift doesn't count: a stroke that is followed straight away
//    by an at-least-as-fast stroke the other way was the pick-up, not the
//    shot.
//
// Positions are in hand sizes (so thresholds don't depend on how far the
// player stands from the camera), x to the player's right, y up.

export const STROKE_PROFILES = {
  // ref: typical full-swing peak speed (hand sizes / s) before calibration.
  stick: { ref: 90, minOn: 16, arcMin: 3.0, swingAbs: 35 },
  hands: { ref: 40, minOn: 8, arcMin: 1.5, swingAbs: 16 },
  touch: { ref: 70, minOn: 12, arcMin: 2.5, swingAbs: 26 },
};

const GAP_MAX = 0.28; // tracking lost longer than this breaks the trajectory
const VEL_WINDOW = 0.045; // velocity baseline
const BACKLIFT_WINDOW = 0.6; // a pick-up is followed by the swing within this
const KEEP = 24;

const angleBetween = (ax, ay, bx, by) => {
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (!la || !lb) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
};

export class StrokeDetector {
  constructor(profile = STROKE_PROFILES.stick) {
    this.configure(profile);
    this.reset();
  }

  configure({ ref, minOn, arcMin, swingAbs, onsetToPeak = 0.12 }) {
    this.ref = ref;
    this.minOn = minOn;
    this.arcMin = arcMin;
    this.swingAbs = swingAbs;
    this.onsetToPeak = onsetToPeak;
  }

  get vOn() {
    return Math.max(this.minOn, 0.22 * this.ref);
  }

  get vOff() {
    return 0.55 * this.vOn;
  }

  /** Peak speed a stroke needs to count as a swing. */
  get swingMin() {
    return Math.max(this.swingAbs, 0.45 * this.ref);
  }

  reset() {
    this.samples = []; // {t, x, y}
    this.vels = []; // {t, vx, vy, speed, x, y}
    this.strokes = []; // finished strokes, oldest first
    this.active = null;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.lastT = -Infinity;
  }

  /** A frame where the bat was not found. */
  miss(t) {
    if (this.active && t - this.lastT > GAP_MAX) this._finish(this.lastT);
    if (t - this.lastT > GAP_MAX) {
      this.speed = 0;
      this.vx = 0;
      this.vy = 0;
    }
  }

  push(t, x, y) {
    if (t - this.lastT > GAP_MAX) {
      if (this.active) this._finish(this.lastT);
      this.samples = [];
    }
    this.lastT = t;
    const samples = this.samples;
    samples.push({ t, x, y });
    while (samples.length > 2 && t - samples[0].t > 1.5) samples.shift();

    // Velocity against the newest sample at least VEL_WINDOW old, stamped at
    // the middle of the interval (a backward difference lags by half of it).
    let ref = null;
    for (let i = samples.length - 2; i >= 0; i--) {
      if (t - samples[i].t >= VEL_WINDOW) {
        ref = samples[i];
        break;
      }
    }
    if (!ref) {
      if (samples.length < 2) return;
      ref = samples[0];
    }
    const dt = t - ref.t;
    if (dt <= 1e-4) return;
    const vx = (x - ref.x) / dt;
    const vy = (y - ref.y) / dt;
    const speed = Math.hypot(vx, vy);
    const v = { t: (t + ref.t) / 2, vx, vy, speed, x, y, tNow: t };
    this.vels.push(v);
    while (this.vels.length > 2 && t - this.vels[0].tNow > 1.5) this.vels.shift();
    this.speed = speed;
    this.vx = vx;
    this.vy = vy;
    this._step(v, samples[samples.length - 2]);
  }

  _step(v, prevSample) {
    const a = this.active;
    if (!a) {
      if (v.speed >= this.vOn) this._begin(v, prevSample);
      return;
    }
    // A sharp turn at speed ends one stroke and starts the next (a backlift
    // flowing straight into the downswing).
    if (
      v.speed >= this.vOn &&
      a.peak >= this.vOn &&
      angleBetween(v.vx, v.vy, a.peakVx, a.peakVy) > (120 * Math.PI) / 180
    ) {
      this._finish(prevSample ? prevSample.t : v.t);
      this._begin(v, prevSample);
      return;
    }
    this._extend(v);
    if (v.speed < this.vOff) {
      a.low++;
      if (a.low >= 2) this._finish(v.tNow);
    } else {
      a.low = 0;
    }
  }

  _begin(v, prevSample) {
    const prev = this.vels.length > 1 ? this.vels[this.vels.length - 2] : null;
    const onset = prev && prev.speed >= this.vOff ? prev.t : v.t - VEL_WINDOW / 2;
    const start = prevSample || { x: v.x, y: v.y, t: v.t };
    this.active = {
      onset,
      start: { x: start.x, y: start.y },
      lastPos: { x: start.x, y: start.y },
      arc: 0,
      peak: 0,
      tPeak: v.t,
      peakVx: v.vx,
      peakVy: v.vy,
      vels: [],
      low: 0,
      end: v.tNow,
    };
    this._extend(v);
  }

  _extend(v) {
    const a = this.active;
    a.arc += Math.hypot(v.x - a.lastPos.x, v.y - a.lastPos.y);
    a.lastPos = { x: v.x, y: v.y };
    a.vels.push(v);
    a.end = v.tNow;
    if (v.speed > a.peak) {
      a.peak = v.speed;
      a.tPeak = v.t;
      a.peakVx = v.vx;
      a.peakVy = v.vy;
    }
  }

  _finish(tEnd) {
    const a = this.active;
    this.active = null;
    if (!a) return;
    a.end = Math.max(a.end, tEnd);
    const s = this._summarize(a, false);
    // The most recent real stroke just before this one (skipping little
    // fragments, e.g. where the backlift curls over at the top).
    let prev = null;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const c = this.strokes[i];
      if (s.onset - c.end > BACKLIFT_WINDOW) break;
      if (c.valid) {
        prev = c;
        break;
      }
    }
    if (
      prev &&
      s.valid &&
      angleBetween(prev.vx, prev.vy, s.vx, s.vy) > (100 * Math.PI) / 180 &&
      s.peak >= 0.85 * prev.peak
    ) {
      prev.backlift = true;
    }
    this.strokes.push(s);
    while (this.strokes.length > KEEP) this.strokes.shift();
  }

  /** Stroke record from raw data (also used for the stroke in progress). */
  _summarize(a, active) {
    const vels = a.vels;
    // Refine the peak time with a parabola through the fastest sample and its neighbours.
    let tPeak = a.tPeak;
    const i = vels.findIndex((v) => v.t === a.tPeak);
    if (i > 0 && i < vels.length - 1) {
      const y0 = vels[i - 1].speed;
      const y1 = vels[i].speed;
      const y2 = vels[i + 1].speed;
      const den = y0 - 2 * y1 + y2;
      if (den < 0) {
        const off = Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den));
        const dt = off > 0 ? vels[i + 1].t - vels[i].t : vels[i].t - vels[i - 1].t;
        tPeak = vels[i].t + off * dt;
      }
    }
    // Direction around the peak.
    let vx = 0;
    let vy = 0;
    let n = 0;
    for (const v of vels) {
      if (Math.abs(v.t - a.tPeak) <= 0.05) {
        vx += v.vx;
        vy += v.vy;
        n++;
      }
    }
    if (n) {
      vx /= n;
      vy /= n;
    } else {
      vx = a.peakVx;
      vy = a.peakVy;
    }
    // Follow-through: where the bat went in the 120 ms after the peak.
    let fx = 0;
    let fy = 0;
    const atPeak = vels[Math.max(0, i)];
    for (const v of vels) {
      if (v.t > a.tPeak && v.t <= a.tPeak + 0.12) {
        fx = v.x - atPeak.x;
        fy = v.y - atPeak.y;
      }
    }
    const duration = a.end - a.onset;
    return {
      onset: a.onset,
      end: a.end,
      tPeak,
      peak: a.peak,
      vx,
      vy,
      fx,
      fy,
      arc: a.arc,
      dx: a.lastPos.x - a.start.x,
      dy: a.lastPos.y - a.start.y,
      duration,
      active,
      backlift: false,
      valid: a.peak >= this.swingMin && a.arc >= this.arcMin && duration <= 1.0,
    };
  }

  /** The stroke in progress, summarized so far, or null. */
  current() {
    return this.active ? this._summarize(this.active, true) : null;
  }

  /** Finished strokes that ended after `t` (plus the stroke in progress). */
  since(t) {
    const out = this.strokes.filter((s) => s.end >= t);
    const c = this.current();
    if (c) out.push(c);
    return out;
  }

  /**
   * Swings for the calibration counter: valid, not a backlift, among the
   * fastest seen (at least 60% of the best), and settled (no follow-up
   * stroke can still turn them into a backlift).
   */
  countedSwings(since, now) {
    const cands = this.strokes.filter((s) => s.onset >= since && s.valid && !s.backlift);
    const best = cands.reduce((m, s) => Math.max(m, s.peak), 0);
    const next = this.active;
    return cands.filter(
      (s) =>
        s.peak >= 0.6 * best &&
        now - s.end >= 0.45 &&
        // A stroke still under way could yet show this one was a backlift.
        !(next && next.onset > s.end && next.onset - s.end <= BACKLIFT_WINDOW),
    );
  }
}
