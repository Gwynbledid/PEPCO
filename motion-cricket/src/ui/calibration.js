import { CALIBRATION_VERSION, defaultCalibration } from '../tracking/batInput.js';
import { STROKE_PROFILES } from '../tracking/strokeDetector.js';
import { drawTracking, fitCanvas } from './overlay.js';

const $ = (id) => document.getElementById(id);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

// Pictograms for each step (simple stick-figure SVGs).
const ICONS = {
  frame: '<svg viewBox="0 0 100 100"><rect x="8" y="12" width="84" height="64" rx="8" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="50" cy="34" r="8" fill="currentColor"/><path d="M50 42v18M38 50h24M50 60l-8 14M50 60l8 14" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M30 88h40" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
  stick: '<svg viewBox="0 0 100 100"><circle cx="50" cy="22" r="9" fill="currentColor"/><path d="M50 32v30M50 62l-10 26M50 62l10 26M36 60l14-8 14 8" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M50 58V8" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></svg>',
  stance: '<svg viewBox="0 0 100 100"><circle cx="46" cy="18" r="9" fill="currentColor"/><path d="M46 28l4 30M50 58l-12 30M50 58l12 30M48 40l10 10" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M58 50l6 40" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></svg>',
  high: '<svg viewBox="0 0 100 100"><circle cx="46" cy="22" r="9" fill="currentColor"/><path d="M46 32l4 28M50 60l-12 30M50 60l12 30M48 40l14-6" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M62 34l16-28" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/></svg>',
  left: '<svg viewBox="0 0 100 100"><circle cx="54" cy="20" r="9" fill="currentColor"/><path d="M54 30v30M54 60l-10 28M54 60l10 28M54 42H26" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M26 42l-8 36" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/><path d="M16 14l-10 8 10 8" stroke="#ff8a4c" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  right: '<svg viewBox="0 0 100 100"><circle cx="46" cy="20" r="9" fill="currentColor"/><path d="M46 30v30M46 60l-10 28M46 60l10 28M46 42h28" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M74 42l8 36" stroke="#ffd23f" stroke-width="7" stroke-linecap="round"/><path d="M84 14l10 8-10 8" stroke="#ff8a4c" stroke-width="5" fill="none" stroke-linecap="round"/></svg>',
  swings: '<svg viewBox="0 0 100 100"><path d="M20 20a45 45 0 0 0 30 66" stroke="#ffd23f" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M50 86l-2-12 12 4" stroke="#ffd23f" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="66" cy="30" r="9" fill="currentColor"/><path d="M66 40v26M66 66l-10 22M66 66l10 22" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/></svg>',
};

/**
 * Guided calibration. It learns what the player's stick looks like, where
 * their stance is, how far they reach and how fast they really swing, so
 * every room, body and camera distance plays the same.
 */
export class Calibration {
  constructor({ input, audio }) {
    this.input = input;
    this.audio = audio;
    this.canvas = $('calOverlay');
    this.ctx = this.canvas.getContext('2d');
    this.onDone = null;
  }

  start(mode) {
    this.mode = mode;
    this.done = false;
    this.result = defaultCalibration(mode);
    const steps = [
      {
        id: 'frame',
        title: 'Get in frame',
        text:
          mode === 'stick'
            ? 'Stand 1.5–2.5 m from the camera, holding your stick like a bat. Your hands and the whole stick should be in view.'
            : 'Stand 1.5–2.5 m from the camera. Hold both hands together as if gripping a bat.',
      },
      ...(mode === 'stick'
        ? [
            {
              id: 'stick',
              title: 'Show me your bat',
              text: 'Hold the stick straight UP in front of your chest, both hands at the bottom, and keep still.',
            },
          ]
        : []),
      { id: 'stance', title: 'Batting stance', text: 'Take your stance with the bat down, and hold still.' },
      { id: 'high', title: 'Backlift', text: 'Lift the bat up high behind you, ready to swing, and hold it there.' },
      { id: 'left', title: 'Reach left', text: 'Move your hands out to your LEFT and hold.' },
      { id: 'right', title: 'Reach right', text: 'Move your hands out to your RIGHT and hold.' },
      {
        id: 'swings',
        title: 'Three real swings',
        text: 'Pick the bat up and swing it hard through the line, 3 times. Backlifts and small moves are ignored.',
      },
    ];
    this.steps = steps;
    this.go(0);
  }

  go(i) {
    this.i = i;
    const step = this.steps[i];
    this.step = step;
    this.hold = 0;
    this.samples = [];
    this.prevGrip = null;
    this.gripSpeed = 0;
    this.stepStart = performance.now() / 1000;
    this.lastCount = 0;
    this.lastNote = 0;
    $('calTitle').textContent = step.title;
    $('calText').textContent = step.text;
    $('calIcon').innerHTML = ICONS[step.id] || '';
    $('calStatus').textContent = '';
    $('calDone').hidden = true;
    $('calLive').hidden = false;
    $('calWarn').hidden = true;
    $('calSwings').hidden = step.id !== 'swings';
    this.setProgress(0);
    this.renderDots();
    if (step.id === 'stick') this.input.stick.beginLearning();
    if (step.id === 'swings') {
      // Measure swings against this player's ranges; count with generous
      // absolute thresholds until their real speed is known.
      this.input.setCalibration(this.build());
      this.input.detector.configure({ ...(STROKE_PROFILES[this.mode] || STROKE_PROFILES.stick), ref: STROKE_PROFILES[this.mode].ref * 0.8 });
      this.renderSwings([]);
    }
  }

  get learning() {
    return this.step?.id === 'stick' && !this.done && !this.paused;
  }

  renderDots() {
    const dots = $('calDots');
    dots.replaceChildren(
      ...this.steps.map((s, idx) => {
        const d = document.createElement('span');
        d.className = idx < this.i ? 'done' : idx === this.i ? 'now' : '';
        return d;
      }),
    );
  }

  renderSwings(swings) {
    const box = $('calSwings');
    const best = Math.max(1, ...swings.map((s) => s.peak));
    box.replaceChildren(
      ...[0, 1, 2].map((k) => {
        const s = swings[k];
        const d = document.createElement('div');
        d.className = `swing-bar${s ? ' ok' : ''}`;
        d.innerHTML = `<span style="width:${s ? Math.round((s.peak / best) * 100) : 0}%"></span><b>${s ? '✓' : k + 1}</b>`;
        return d;
      }),
    );
  }

  status(text) {
    $('calStatus').textContent = text;
  }

  setProgress(p) {
    $('calRing').style.setProperty('--p', Math.max(0, Math.min(1, p)));
  }

  next() {
    this.audio.stepDone();
    if (this.i + 1 < this.steps.length) this.go(this.i + 1);
    else this.finish();
  }

  /** Calibration from what's been measured so far. */
  build() {
    const r = this.result;
    const stance = r.stance;
    const rangeX = r.left && r.right ? Math.max(0.06, (r.right.x - r.left.x) / 2) : r.rangeX;
    const rangeUp = r.high ? Math.max(0.06, stance.y - r.high.y) : r.rangeUp;
    return { ...r, version: CALIBRATION_VERSION, mode: this.mode, rangeX, rangeUp };
  }

  finish(swings = []) {
    const peaks = swings.map((s) => s.peak);
    const cal = this.build();
    if (peaks.length) {
      cal.ref = median(peaks);
      cal.onsetToPeak = Math.min(0.25, Math.max(0.05, median(swings.map((s) => s.tPeak - s.onset))));
    }
    this.calib = cal;
    this.input.setCalibration(cal);
    this.done = true;
    this.i = this.steps.length;
    this.renderDots();
    $('calLive').hidden = true;
    $('calDone').hidden = false;
    $('calSwings').hidden = true;
    $('calIcon').innerHTML = '';
    $('calTitle').textContent = 'All set!';
    $('calText').textContent = 'Swing UP through the ball to hit it in the air. Swing DOWN to keep it on the ground.';
    const q = cal.stick?.quality;
    $('calSummary').textContent = [
      q ? `Stick detection: ${q === 'good' ? 'great' : q === 'ok' ? 'good' : 'weak'}` : null,
      `Full swing speed: ${Math.round(cal.ref)}`,
    ]
      .filter(Boolean)
      .join(' · ');
    this.audio.calibrationDone();
  }

  // -----------------------------------------------------------------------

  /** Stick step: the tracker learns the stick from this frame. */
  learnFrame(frame, landmarks) {
    const W = frame.width;
    const H = frame.height;
    const handsPx = (landmarks || []).map((lm) => lm.map((p) => ({ x: p.x * W, y: p.y * H })));
    const res = this.input.stick.learnFrame(frame, handsPx);
    const mirror = (p) => ({ x: 1 - p.x / W, y: p.y / H });
    const raw = this.input.raw;
    raw.hands = handsPx.map((lm) => lm.map(mirror));
    raw.grip = res.origin ? mirror(res.origin) : null;
    raw.tip = res.tip ? mirror(res.tip) : null;
    raw.conf = res.found ? 1 : 0;
    raw.predicted = false;
    const need = 24;
    this.setProgress(res.frames / need);
    if (!res.hands.length) this.status('Looking for your hands…');
    else if (!res.found) this.status('Looking for the stick above your hands… hold it upright');
    else this.status('Got it, hold still…');
    if (res.frames >= need) {
      const model = this.input.stick.finishLearning();
      if (!model) {
        this.input.stick.beginLearning();
        return;
      }
      this.result.stick = model;
      if (model.quality === 'poor') {
        this.paused = true;
        $('calWarn').hidden = false;
        $('calWarnText').textContent =
          'Your stick is hard to tell apart from what is behind you. For the best tracking, wrap it in brightly coloured paper or tape (not white, red or skin-coloured), or stand in front of a plainer, different-coloured background.';
      } else {
        this.next();
      }
    }
  }

  retryStick() {
    this.paused = false;
    $('calWarn').hidden = true;
    this.input.stick.beginLearning();
  }

  acceptStick() {
    this.paused = false;
    $('calWarn').hidden = true;
    this.next();
  }

  /** Every frame, after the input has processed the camera frame. */
  update(dt) {
    const raw = this.input.raw;
    this.draw(raw);
    if (this.done || !this.step || this.step.id === 'stick') return;
    const id = this.step.id;

    if (raw.grip && this.prevGrip) {
      const v = Math.hypot(raw.grip.x - this.prevGrip.x, raw.grip.y - this.prevGrip.y) / Math.max(dt, 1e-3);
      this.gripSpeed += (v - this.gripSpeed) * 0.3;
    }
    this.prevGrip = raw.grip ? { ...raw.grip } : null;

    if (!raw.grip) {
      this.hold = 0;
      this.setProgress(0);
      this.status('Looking for your hands…');
      return;
    }

    if (id === 'frame') {
      if (raw.scale > 0.1) return this.status('Step back a little');
      if (raw.scale > 0 && raw.scale < 0.018) return this.status('Come a little closer');
      if (this.mode === 'stick' && raw.hands.length < 1) return this.status('Show your hands');
      this.status('Great, hold it…');
      return this.holdFor(dt, 1.0, () => true);
    }
    const s = this.result.stance;
    if (id === 'stance') return this.holdFor(dt, 1.2, () => true, () => (this.result.stance = this.avgGrip()));
    if (id === 'high') {
      const ok = raw.grip.y < s.y - 0.07;
      if (!ok) this.status('Higher!');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.high = this.avgGrip()));
    }
    if (id === 'left') {
      const ok = raw.grip.x < s.x - 0.06;
      if (!ok) this.status('Further left');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.left = this.avgGrip()));
    }
    if (id === 'right') {
      const ok = raw.grip.x > s.x + 0.06;
      if (!ok) this.status('Further right');
      return this.holdFor(dt, 0.8, () => ok, () => (this.result.right = this.avgGrip()));
    }
    if (id === 'swings') return this.updateSwings();
  }

  updateSwings() {
    const det = this.input.detector;
    const now = performance.now() / 1000;
    const swings = det.countedSwings(this.stepStart, now);
    if (swings.length !== this.lastCount) {
      if (swings.length > this.lastCount) {
        const s = swings[swings.length - 1];
        this.audio.swing(s.peak / Math.max(1, swings[0].peak));
        this.audio.tick();
      }
      this.lastCount = swings.length;
      this.renderSwings(swings);
    }
    this.setProgress(swings.length / 3);
    // Tell the player what was ignored, so the counting makes sense.
    const recent = det.strokes.filter((x) => x.end > this.stepStart && x.end > now - 1.2);
    const last = recent[recent.length - 1];
    if (last && now - this.lastNote > 0.8) {
      if (last.backlift) this.status('Backlift ignored ✓ now swing through');
      else if (!last.valid && last.arc < det.arcMin) this.status('That was just a small move — swing properly');
      else if (!last.valid) this.status('A bit faster!');
      else this.status(`Swing ${Math.min(3, swings.length)} of 3`);
      this.lastNote = now;
    }
    if (swings.length >= 3) this.finish(swings.slice(-3));
  }

  /** Requires the grip to be still (and `cond` true) for `secs`, sampling as it goes. */
  holdFor(dt, secs, cond, onDone) {
    const still = this.gripSpeed < 0.3;
    if (cond() && still) {
      this.hold += dt;
      this.samples.push({ ...this.input.raw.grip });
      if (this.hold > 0.15) this.status('Hold still…');
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
    return { x: recent.reduce((a, p) => a + p.x, 0) / n, y: recent.reduce((a, p) => a + p.y, 0) / n };
  }

  draw(raw) {
    const { w, h, dpr } = fitCanvas(this.canvas);
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const id = this.step?.id;
    const s = this.result?.stance;
    if (!this.done && s && ['high', 'left', 'right'].includes(id)) {
      const to = { high: [0, -0.2], left: [-0.18, 0], right: [0.18, 0] }[id];
      const x0 = s.x * w;
      const y0 = s.y * h;
      const x1 = (s.x + to[0]) * w;
      const y1 = (s.y + to[1]) * h;
      ctx.strokeStyle = 'rgba(255,210,63,0.9)';
      ctx.fillStyle = 'rgba(255,210,63,0.9)';
      ctx.lineWidth = 8 * dpr;
      ctx.lineCap = 'round';
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
    }
    if (!this.done && id === 'stick' && raw.hands.length) {
      // Guide: where the upright stick should be.
      const g = raw.hands[0][9];
      ctx.setLineDash([10 * dpr, 10 * dpr]);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 4 * dpr;
      ctx.beginPath();
      ctx.moveTo(g.x * w, g.y * h);
      ctx.lineTo(g.x * w, (g.y - 0.4) * h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    drawTracking(ctx, w, h, raw, { mode: this.mode });
  }
}
