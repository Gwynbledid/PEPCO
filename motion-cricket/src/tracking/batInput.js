import { OneEuro } from './filters.js';

// Palm centre = mean of the wrist and the four finger-base knuckles.
const PALM = [0, 5, 9, 13, 17];
const INDEX_MCP = 5;
const PINKY_MCP = 17;
// Distance from the grip to the "sweet spot" of the bat, in calibrated units.
const BAT_REACH = 0.9;
const HISTORY_SECONDS = 1.5;

export const DEFAULT_CALIBRATION = {
  stance: { x: 0.5, y: 0.6 },
  rangeX: 0.22,
  rangeUp: 0.25,
  refSpeed: 9,
  threshold: 3.2,
};

const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/**
 * Fuses hand landmarks, the stick marker or pointer input into one bat.
 *
 * Coordinates:
 *  - "raw" values are mirrored, normalized image coords (0..1, y down), which
 *    match what the player sees in the mirrored camera preview.
 *  - "state" values are calibrated: the batting stance is (0, 0), a
 *    comfortable reach to either side is x = ±1, the backlift is y = +1 (up).
 */
export class BatInput {
  constructor() {
    this.mode = 'hands';
    this.calib = { ...DEFAULT_CALIBRATION };
    this.aspect = 4 / 3;
    this.raw = { tracked: false, hands: [], grip: null, tip: null, dir: [0, 1], handScale: 0 };
    this.state = {
      tracked: false,
      t: 0,
      gx: 0,
      gy: 0,
      hx: 0,
      hy: -BAT_REACH,
      angle: -Math.PI / 2, // on-screen bat angle, 0 = pointing right, +90° = up
      vx: 0,
      vy: 0,
      speed: 0,
    };
    this.history = [];
    this.swings = [];
    this.armed = true;
    this.lastSeen = -Infinity;
    this.pointer = null;
    this.f = {
      gx: new OneEuro(1.0, 0.7),
      gy: new OneEuro(1.0, 0.7),
      hx: new OneEuro(1.2, 0.8),
      hy: new OneEuro(1.2, 0.8),
    };
  }

  setMode(mode) {
    this.mode = mode;
    this.reset();
  }

  setCalibration(calib) {
    this.calib = { ...DEFAULT_CALIBRATION, ...calib };
    this.reset();
  }

  reset() {
    Object.values(this.f).forEach((f) => f.reset());
    this.history = [];
    this.swings = [];
    this.armed = true;
  }

  /** Mirrored, normalized image point -> calibrated space. */
  toCalibrated(p) {
    const c = this.calib;
    return [(p.x - c.stance.x) / c.rangeX, (c.stance.y - p.y) / c.rangeUp];
  }

  /** Camera frame update. `hands` = MediaPipe landmarks, `marker` = MarkerTracker result. */
  updateFromCamera(t, hands, marker, aspect) {
    this.aspect = aspect || this.aspect;
    const a = this.aspect;
    const raw = this.raw;
    raw.hands = (hands || []).map((lm) => lm.map((p) => ({ x: 1 - p.x, y: p.y })));

    let grip = null;
    let dirX = 0;
    let dirY = 0;
    if (raw.hands.length) {
      let gx = 0;
      let gy = 0;
      const palms = raw.hands.map((lm) => {
        let px = 0;
        let py = 0;
        for (const i of PALM) {
          px += lm[i].x;
          py += lm[i].y;
        }
        return { x: px / PALM.length, y: py / PALM.length };
      });
      palms.forEach((p) => {
        gx += p.x;
        gy += p.y;
      });
      grip = { x: gx / palms.length, y: gy / palms.length };

      // In a fist wrapped around a handle, the line from the index knuckle to
      // the little-finger knuckle runs along the handle, pointing to the blade.
      for (const lm of raw.hands) {
        const [kx, ky] = norm((lm[PINKY_MCP].x - lm[INDEX_MCP].x) * a, lm[PINKY_MCP].y - lm[INDEX_MCP].y);
        dirX += kx;
        dirY += ky;
      }
      // With two hands on the handle, the line between them is a steadier
      // estimate of the handle.
      if (palms.length === 2) {
        const ix = (palms[1].x - palms[0].x) * a;
        const iy = palms[1].y - palms[0].y;
        if (Math.hypot(ix, iy) > 0.05) {
          let [nx, ny] = norm(ix, iy);
          if (nx * dirX + ny * dirY < 0) {
            nx = -nx;
            ny = -ny;
          }
          dirX += nx * 1.5;
          dirY += ny * 1.5;
        }
      }
      const lm = raw.hands[0];
      raw.handScale = Math.hypot((lm[9].x - lm[0].x) * a, lm[9].y - lm[0].y);
    }

    let tip = null;
    if (this.mode === 'stick' && marker) {
      tip = { x: 1 - marker.x, y: marker.y };
      if (!grip && raw.grip && raw.tip) {
        // Hands hidden behind the stick: keep the last grip-to-tip offset.
        grip = { x: tip.x - (raw.tip.x - raw.grip.x), y: tip.y - (raw.tip.y - raw.grip.y) };
      }
      if (grip) {
        dirX = (tip.x - grip.x) * a;
        dirY = tip.y - grip.y;
      }
    }

    const tracked = this.mode === 'stick' ? !!(tip && grip) : !!grip;
    raw.tracked = tracked;
    raw.grip = grip;
    raw.tip = tip;
    if (!tracked) {
      if (t - this.lastSeen > 0.35) this.state.tracked = false;
      return;
    }
    this.lastSeen = t;
    if (dirX !== 0 || dirY !== 0) raw.dir = norm(dirX, dirY);

    const [gcx, gcy] = this.toCalibrated(grip);
    let hcx;
    let hcy;
    if (tip) {
      [hcx, hcy] = this.toCalibrated(tip);
    } else {
      // Direction from screen space into (anisotropic) calibrated space.
      const [cx, cy] = norm(raw.dir[0] / a / this.calib.rangeX, -raw.dir[1] / this.calib.rangeUp);
      hcx = gcx + cx * BAT_REACH;
      hcy = gcy + cy * BAT_REACH;
    }
    this._push(t, gcx, gcy, hcx, hcy, Math.atan2(-raw.dir[1], raw.dir[0]));
  }

  /** Touch / mouse input: `nx`, `ny` in -1..1 across the screen, y up. */
  setPointer(nx, ny) {
    this.pointer = { x: nx, y: ny };
  }

  clearPointer() {
    this.pointer = null;
  }

  /** Called every animation frame in touch mode so velocity decays when still. */
  updateFromPointer(t) {
    const p = this.pointer || { x: this.state.hx / 1.3, y: -0.7 };
    const hx = p.x * 1.3;
    const hy = p.y * 1.4;
    const gx = hx * 0.45;
    const gy = hy * 0.4 + 0.25;
    this._push(t, gx, gy, hx, hy, Math.atan2(hy - gy, hx - gx), true);
  }

  _push(t, gx, gy, hx, hy, angle, unfiltered = false) {
    const s = this.state;
    if (!unfiltered) {
      gx = this.f.gx.filter(gx, t);
      gy = this.f.gy.filter(gy, t);
      hx = this.f.hx.filter(hx, t);
      hy = this.f.hy.filter(hy, t);
    }
    // Velocity over a ~60 ms baseline is less noisy than frame to frame.
    let vx = 0;
    let vy = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      const h = this.history[i];
      if (t - h.t >= 0.06 || i === 0) {
        const dt = t - h.t;
        if (dt > 0.005) {
          vx = (hx - h.hx) / dt;
          vy = (hy - h.hy) / dt;
        }
        break;
      }
    }
    Object.assign(s, { tracked: true, t, gx, gy, hx, hy, angle, vx, vy, speed: Math.hypot(vx, vy) });
    this.history.push({ t, gx, gy, hx, hy, vx, vy, speed: s.speed });
    while (this.history.length && t - this.history[0].t > HISTORY_SECONDS) this.history.shift();

    // Swing onset: speed rises through the threshold (hysteresis re-arms it).
    const th = this.calib.threshold;
    if (this.armed && s.speed > th) {
      this.armed = false;
      this.swings.push({ t, gx, gy, hx, hy });
    } else if (!this.armed && s.speed < th * 0.45) {
      this.armed = true;
    }
  }

  /** Swing onsets detected since the last call. */
  takeSwings() {
    const out = this.swings;
    this.swings = [];
    return out;
  }

  /** Mean velocity of the bat head over [t0, t1]. */
  velocityBetween(t0, t1) {
    let vx = 0;
    let vy = 0;
    let n = 0;
    let peak = 0;
    for (const h of this.history) {
      if (h.t < t0 || h.t > t1) continue;
      vx += h.vx;
      vy += h.vy;
      peak = Math.max(peak, h.speed);
      n++;
    }
    if (!n) return { vx: this.state.vx, vy: this.state.vy, peak: this.state.speed };
    return { vx: vx / n, vy: vy / n, peak };
  }
}
