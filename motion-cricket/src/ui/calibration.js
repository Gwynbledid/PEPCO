import { DEFAULT_CALIBRATION } from '../tracking/batInput.js';
import { drawTracking, fitCanvas } from './overlay.js';

const $ = (id) => document.getElementById(id);

// Colour sample circle for stick mode (mirrored, normalized coords).
const SAMPLE = { x: 0.5, y: 0.32, r: 0.07 };

/**
 * Guided calibration. It measures where the player's stance is, how far
 * they reach, and how fast they swing, so that every body size and camera
 * distance maps onto the same bat movement in the game.
 */
export class Calibration {
  constructor({ input, marker, audio, onDone }) {
    this.input = input;
    this.marker = marker;
    this.audio = audio;
    this.onDone = onDone;
    this.canvas = $('calOverlay');
    this.ctx = this.canvas.getContext('2d');
  }

  start(mode) {
    this.mode = mode;
    this.done = false;
    this.result = { marker: null };
    const steps = [
      {
        id: 'frame',
        title: 'Get in frame',
        text:
          mode === 'stick'
            ? 'Stand 1.5–2 m back. Hold your stick like a bat so both hands and the coloured tip are visible.'
            : 'Stand 1.5–2 m back. Hold both hands together as if gripping a bat.',
      },
      ...(mode === 'stick'
        ? [{ id: 'color', title: 'Show the stick tip', text: 'Hold the coloured tip of your stick inside the circle.' }]
        : []),
      { id: 'stance', title: 'Batting stance', text: 'Take your batting stance with the bat down and hold still.' },
      { id: 'high', title: 'Backlift', text: 'Lift the bat up high, ready to swing, and hold it there.' },
      { id: 'left', title: 'Reach left', text: 'Move your hands out to your LEFT and hold.' },
      { id: 'right', title: 'Reach right', text: 'Move your hands out to your RIGHT and hold.' },
      { id: 'swings', title: 'Practice swings', text: 'Swing hard 3 times, as if you are hitting a ball.' },
    ];
    this.steps = steps;
    this.renderDots();
    this.go(0);
  }

  go(i) {
    this.i = i;
    const step = this.steps[i];
    this.step = step;
    this.hold = 0;
    this.progress = 0;
    this.stillSince = null;
    this.prevGrip = null;
    this.gripSpeed = 0;
    this.samples = [];
    this.swingPeaks = [];
    this.curPeak = 0;
    this.sampleClock = 0;
    this.hueRun = [];
    $('calTitle').textContent = step.title;
    $('calText').textContent = step.text;
    $('calStatus').textContent = '';
    $('calDone').hidden = true;
    $('calLive').hidden = false;
    this.renderDots();
    if (step.id === 'swings') {
      // Use the ranges measured so far, so swing speed is in calibrated units.
      this.input.setCalibration({ ...this.buildCalibration(), threshold: 99 });
    }
  }

  renderDots() {
    const dots = $('calDots');
    dots.innerHTML = '';
    this.steps.forEach((s, idx) => {
      const d = document.createElement('span');
      d.className = idx < this.i ? 'done' : idx === this.i ? 'now' : '';
      dots.appendChild(d);
    });
  }

  status(text) {
    $('calStatus').textContent = text;
  }

  setProgress(p) {
    this.progress = Math.max(0, Math.min(1, p));
    $('calRing').style.setProperty('--p', this.progress);
  }

  next() {
    this.audio.success();
    if (this.i + 1 < this.steps.length) this.go(this.i + 1);
    else this.finish();
  }

  buildCalibration() {
    const r = this.result;
    const stance = r.stance || DEFAULT_CALIBRATION.stance;
    const rangeX = r.left && r.right ? Math.max(0.08, (r.right.x - r.left.x) / 2) : DEFAULT_CALIBRATION.rangeX;
    const rangeUp = r.high ? Math.max(0.08, stance.y - r.high.y) : DEFAULT_CALIBRATION.rangeUp;
    return { ...DEFAULT_CALIBRATION, stance: { ...stance }, rangeX, rangeUp };
  }

  finish() {
    const peaks = [...this.swingPeaks].sort((a, b) => a - b);
    const ref = peaks.length ? peaks[Math.floor(peaks.length / 2)] : DEFAULT_CALIBRATION.refSpeed;
    const calib = {
      ...this.buildCalibration(),
      refSpeed: Math.max(4, ref),
      // Trigger a swing at ~35% of a full swing, so waggles don't count.
      threshold: Math.min(7, Math.max(2.2, ref * 0.35)),
      marker: this.result.marker,
    };
    this.calib = calib;
    this.input.setCalibration(calib);
    $('calLive').hidden = true;
    $('calDone').hidden = false;
    $('calTitle').textContent = 'All set!';
    $('calText').textContent = 'Calibration saved. Swing up for lofted shots, down to keep it on the ground.';
    $('calSummary').textContent = `Reach ${(calib.rangeX * 200).toFixed(0)}% · Backlift ${(calib.rangeUp * 100).toFixed(0)}% · Swing speed ${calib.refSpeed.toFixed(1)}`;
    this.i = this.steps.length;
    this.renderDots();
    this.done = true;
  }

  /** Per-frame update after the input has consumed the latest camera frame. */
  update(dt, video) {
    const raw = this.input.raw;
    this.draw(raw);
    if (this.done || !this.step) return;
    const id = this.step.id;

    // Grip movement speed in raw image units per second (for "hold still").
    if (raw.grip && this.prevGrip) {
      const v = Math.hypot(raw.grip.x - this.prevGrip.x, raw.grip.y - this.prevGrip.y) / Math.max(dt, 1e-3);
      this.gripSpeed += (v - this.gripSpeed) * 0.3;
    }
    this.prevGrip = raw.grip ? { ...raw.grip } : null;

    if (id === 'color') return this.updateColor(dt, video);
    // The stick tip can't be tracked until its colour is learned.
    const present = id === 'frame' ? !!raw.grip : raw.tracked;
    if (!present) {
      this.hold = 0;
      this.setProgress(0);
      this.status(this.mode === 'stick' ? 'Looking for your hands and the stick tip…' : 'Looking for your hands…');
      return;
    }

    if (id === 'frame') {
      if (raw.handScale > 0.22) return this.status('Step back a little');
      if (raw.handScale < 0.045) return this.status('Come a little closer');
      if (this.mode === 'hands' && raw.hands.length < 2) this.status('Both hands work best, but one is OK');
      else this.status('Great, hold it…');
      return this.holdFor(dt, 1.0, () => true);
    }

    const s = this.result.stance;
    if (id === 'stance') {
      return this.holdFor(dt, 1.2, () => true, () => (this.result.stance = this.avgGrip()));
    }
    if (id === 'high') {
      const ok = raw.grip.y < s.y - 0.08;
      if (!ok) this.status('Higher!');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.high = this.avgGrip()));
    }
    if (id === 'left') {
      const ok = raw.grip.x < s.x - 0.07;
      if (!ok) this.status('Further left');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.left = this.avgGrip()));
    }
    if (id === 'right') {
      const ok = raw.grip.x > s.x + 0.07;
      if (!ok) this.status('Further right');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.right = this.avgGrip()));
    }
    if (id === 'swings') {
      const sp = this.input.state.speed;
      if (sp > 3) this.curPeak = Math.max(this.curPeak, sp);
      else if (this.curPeak > 0 && sp < 1.5) {
        if (this.curPeak > 4) {
          this.swingPeaks.push(this.curPeak);
          this.audio.click();
          this.status(`Swing ${this.swingPeaks.length}/3 ✓`);
        }
        this.curPeak = 0;
      }
      this.setProgress(this.swingPeaks.length / 3);
      if (this.swingPeaks.length >= 3) this.next();
    }
  }

  /** Requires the grip to be still (and `cond` true) for `secs`, sampling as it goes. */
  holdFor(dt, secs, cond, onDone) {
    const still = this.gripSpeed < 0.35;
    if (cond() && still) {
      this.hold += dt;
      this.samples.push({ ...this.input.raw.grip });
      if (this.step.id !== 'frame' && this.hold > 0.15) this.status('Hold still…');
    } else {
      this.hold = Math.max(0, this.hold - dt * 2);
      if (this.hold === 0) this.samples = [];
      if (cond() && !still) this.status('Hold still…');
    }
    this.setProgress(this.hold / secs);
    if (this.hold >= secs) {
      onDone?.();
      this.next();
    }
  }

  avgGrip() {
    const recent = this.samples.slice(-20);
    const n = recent.length || 1;
    return {
      x: recent.reduce((a, p) => a + p.x, 0) / n,
      y: recent.reduce((a, p) => a + p.y, 0) / n,
    };
  }

  updateColor(dt, video) {
    this.sampleClock += dt;
    if (this.sampleClock < 0.35) return;
    this.sampleClock = 0;
    // The sample circle is in mirrored coords; the video frame isn't mirrored.
    const t = this.marker.sample(video, 1 - SAMPLE.x, SAMPLE.y, SAMPLE.r);
    if (!t) {
      this.hueRun = [];
      this.status('Put the coloured tip inside the circle');
      this.setProgress(0);
      return;
    }
    const last = this.hueRun[this.hueRun.length - 1];
    const close = last && Math.min(Math.abs(last.h - t.h), 360 - Math.abs(last.h - t.h)) < 14;
    this.hueRun = close || !last ? [...this.hueRun, t] : [t];
    this.setProgress(this.hueRun.length / 4);
    this.status('Hold it there…');
    if (this.hueRun.length >= 4) {
      const target = this.hueRun[this.hueRun.length - 1];
      this.marker.setTarget(target);
      this.result.marker = target;
      this.next();
    }
  }

  draw(raw) {
    const { w, h, dpr } = fitCanvas(this.canvas);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const id = this.step?.id;
    if (!this.done && id === 'color') {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 4 * dpr;
      ctx.setLineDash([10 * dpr, 8 * dpr]);
      ctx.beginPath();
      ctx.arc(SAMPLE.x * w, SAMPLE.y * h, SAMPLE.r * w, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const s = this.result?.stance;
    if (!this.done && s && ['high', 'left', 'right'].includes(id)) {
      // Arrow from the stance towards where the hands should go.
      const to = { high: [0, -0.2], left: [-0.18, 0], right: [0.18, 0] }[id];
      const x0 = s.x * w;
      const y0 = s.y * h;
      const x1 = (s.x + to[0]) * w;
      const y1 = (s.y + to[1]) * h;
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.fillStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 8 * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.beginPath();
      ctx.moveTo(x1 + Math.cos(a) * 18 * dpr, y1 + Math.sin(a) * 18 * dpr);
      ctx.lineTo(x1 + Math.cos(a + 2.4) * 22 * dpr, y1 + Math.sin(a + 2.4) * 22 * dpr);
      ctx.lineTo(x1 + Math.cos(a - 2.4) * 22 * dpr, y1 + Math.sin(a - 2.4) * 22 * dpr);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(x0, y0, 8 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    drawTracking(ctx, w, h, raw);
  }
}
