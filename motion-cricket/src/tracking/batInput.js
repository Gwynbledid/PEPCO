import { OneEuro } from './filters.js';
import { analyzeHand, batDirectionFromHands } from './handGeometry.js';
import { StickTracker } from './stickTracker.js';
import { STROKE_PROFILES, StrokeDetector } from './strokeDetector.js';

// Combines hand tracking, the stick tracker and the stroke detector into one
// bat for the game.
//
//  - Stick mode (default): the bat IS the stick, found in the image.
//  - Hands mode: no stick; the bat direction is inferred from the fists.
//  - Touch mode: the bat follows a finger or the mouse.
//
// Coordinates handed to the game are mirrored like the camera preview (move
// right → bat moves right). "Calibrated" grip: stance = (0, 0), a
// comfortable reach to either side = ±1, backlift = +1 (up).

export const CALIBRATION_VERSION = 3;

export function defaultCalibration(mode) {
  const profile = STROKE_PROFILES[mode] || STROKE_PROFILES.stick;
  return {
    version: CALIBRATION_VERSION,
    mode,
    stance: { x: 0.5, y: 0.62 },
    rangeX: 0.2,
    rangeUp: 0.22,
    ref: profile.ref,
    onsetToPeak: 0.12,
    stick: null,
  };
}

const unwrapTo = (a, ref) => {
  let d = a - ref;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return ref + d;
};

export class BatInput {
  constructor() {
    this.mode = 'stick';
    this.stick = new StickTracker();
    this.detector = new StrokeDetector(STROKE_PROFILES.stick);
    this.calib = defaultCalibration('stick');
    this.raw = { hands: [], grip: null, tip: null, found: false, conf: 0, predicted: false, scale: 0 };
    this.state = { tracked: false, conf: 0, t: 0, gx: 0, gy: 0, angle: -Math.PI / 2, ratio: 0.85 };
    this.handDir = { x: 0, y: 1 };
    this.f = {
      gx: new OneEuro(1.2, 0.5),
      gy: new OneEuro(1.2, 0.5),
      angle: new OneEuro(1.8, 0.35),
      ratio: new OneEuro(0.8, 0.2),
    };
    this.lastSeen = -Infinity;
    this.motion = null; // integrated swing position in hand sizes
    this.pointer = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.setCalibration(defaultCalibration(mode));
  }

  setCalibration(calib) {
    this.calib = { ...defaultCalibration(this.mode), ...calib };
    const profile = STROKE_PROFILES[this.mode] || STROKE_PROFILES.stick;
    this.detector.configure({ ...profile, ref: this.calib.ref, onsetToPeak: this.calib.onsetToPeak });
    this.stick.setModel(this.calib.stick);
    this.reset();
  }

  reset() {
    for (const f of Object.values(this.f)) f.reset();
    this.detector.reset();
    this.stick.reset();
    this.motion = null;
  }

  // -----------------------------------------------------------------------

  /**
   * @param {number} t seconds (input clock)
   * @param {import('./frame.js').WorkFrame|null} frame working copy of the camera frame
   * @param {Array} landmarks MediaPipe hand landmarks (normalized, un-mirrored)
   */
  processCamera(t, frame, landmarks) {
    const W = frame.width;
    const H = frame.height;
    const handsPx = (landmarks || []).map((lm) => lm.map((p) => ({ x: p.x * W, y: p.y * H })));
    const mirror = (p) => ({ x: 1 - p.x / W, y: p.y / H });
    const raw = this.raw;
    raw.hands = handsPx.map((lm) => lm.map(mirror));
    raw.predicted = false;

    let grip = null; // px, un-mirrored
    let tip = null;
    let dir = null; // unit, un-mirrored image space (y down)
    let scale = 0;
    let conf = 0;
    let lengthRel = null;

    if (this.mode === 'stick') {
      const res = this.stick.update(frame, handsPx, t);
      scale = res.scale || this.stick.scale;
      if (res.found) {
        grip = res.origin;
        tip = res.tip;
        dir = { x: Math.cos(res.angle), y: Math.sin(res.angle) };
        conf = res.conf;
        lengthRel = res.lengthRel;
        raw.predicted = res.predicted;
      } else if (res.hands.length) {
        // Stick not seen this frame: keep the grip, hold the last direction.
        grip = mid(res.hands.map((h) => h.palm));
        conf = 0.2;
      }
    } else if (handsPx.length) {
      const hands = handsPx.map(analyzeHand);
      grip = mid(hands.map((h) => h.palm));
      scale = hands.reduce((a, h) => a + h.scale, 0) / hands.length;
      const d = batDirectionFromHands(hands, this.handDir);
      this.handDir = d;
      dir = d;
      tip = { x: grip.x + d.x * scale * 5, y: grip.y + d.y * scale * 5 };
      conf = 0.7;
    }

    raw.found = !!(tip && this.mode === 'stick');
    raw.conf = conf;
    raw.grip = grip ? mirror(grip) : null;
    raw.tip = tip ? mirror(tip) : null;
    raw.scale = scale / W;

    if (!grip) {
      if (t - this.lastSeen > 0.35) this.state.tracked = false;
      this.detector.miss(t);
      return;
    }
    this.lastSeen = t;
    const s = this.state;
    const g = mirror(grip);
    const c = this.calib;
    s.gx = this.f.gx.filter((g.x - c.stance.x) / c.rangeX, t);
    s.gy = this.f.gy.filter((c.stance.y - g.y) / c.rangeUp, t);
    if (dir) {
      // Mirrored, y up.
      const a = Math.atan2(-dir.y, -dir.x);
      s.angle = this.f.angle.filter(unwrapTo(a, s.angle), t);
    }
    if (lengthRel && c.stick?.lengthRel) {
      s.ratio = this.f.ratio.filter(Math.min(1.1, lengthRel / c.stick.lengthRel), t);
    }
    s.tracked = true;
    s.conf = conf;
    s.t = t;

    // Swing motion, in hand sizes: the stick tip (stick mode) or the hands.
    const point = this.mode === 'stick' ? tip : grip;
    if (point && scale > 0) this._motion(t, point, scale);
    else this.detector.miss(t);
  }

  _motion(t, p, scale) {
    const m = this.motion;
    if (!m || t - m.t > 0.3) {
      this.motion = { x: -p.x / scale, y: -p.y / scale, px: p.x, py: p.y, t };
      this.detector.push(t, this.motion.x, this.motion.y);
      return;
    }
    // Integrate pixel steps divided by the current hand size, so a changing
    // hand size never looks like movement. Mirrored, y up.
    const dx = -(p.x - m.px) / scale;
    const dy = -(p.y - m.py) / scale;
    // More than ~25 hand sizes in one frame is a tracking glitch.
    if (Math.hypot(dx, dy) > 25 * Math.max(1, (t - m.t) * 30)) {
      this.detector.miss(t);
      return;
    }
    m.x += dx;
    m.y += dy;
    m.px = p.x;
    m.py = p.y;
    m.t = t;
    this.detector.push(t, m.x, m.y);
  }

  // -----------------------------------------------------------------------
  // Touch / mouse

  setPointer(nx, ny) {
    this.pointer = { x: nx, y: ny };
  }

  /** Every frame in touch mode. The pointer (-1..1, y up) is the bat's toe. */
  processPointer(t) {
    const p = this.pointer || { x: -0.1, y: -0.6 };
    const s = this.state;
    s.gx = p.x * 0.55;
    s.gy = p.y * 0.5 + 0.25;
    s.angle = Math.atan2(p.y + 0.15, p.x - 0.05);
    s.ratio = 0.85;
    s.tracked = true;
    s.conf = 1;
    s.t = t;
    // Screen units → pseudo hand sizes (half the screen ≈ 12).
    this.detector.push(t, p.x * 12, p.y * 12);
  }
}

function mid(points) {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}
