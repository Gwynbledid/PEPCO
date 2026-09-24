// Where the first-person bat is drawn.
//
// 'follow' (default): the bat copies the tracked hands and stick, live. When
// tracking drops out it eases back to a resting backlift; when a fast swing
// blurs the stick (the tracked angle stops changing mid-swing), the swing
// animation carries it through in the direction the hands went.
//
// 'backlift': the bat waits raised up to the side, out of the way of the view
// down the pitch, and plays the swing animation when the player swings.
//
// The result is in the same form as BatInput.state, so the rig draws it.

const DEG = Math.PI / 180;
const SWING = 0.22; // backlift → follow-through
const HOLD = 0.35; // hold the finish
const BACK = 0.5; // return to the backlift

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export class BatPose {
  constructor() {
    this.mode = 'follow';
    this.anim = null;
    this.live = 0; // 0 = resting pose, 1 = following the tracked bat
    this.lastAngle = null;
    this.stale = 0; // how long the tracked angle hasn't moved
    this.state = { tracked: true, gx: 0, gy: 0, angle: 0, ratio: 0.9 };
  }

  reset() {
    this.anim = null;
  }

  /** @param {'follow'|'backlift'} mode */
  setMode(mode) {
    this.mode = mode === 'backlift' ? 'backlift' : 'follow';
    this.anim = null;
  }

  backlift(hand, inp) {
    // A little life from the tracked hands, but mostly a steady pose.
    const jx = inp?.tracked ? clamp(inp.gx, -1.5, 1.5) * 0.2 : 0;
    const jy = inp?.tracked ? clamp(inp.gy, -1.5, 1.5) * 0.12 : 0;
    return { gx: 0.95 * hand + jx, gy: 1.05 + jy, angle: (hand > 0 ? 62 : 118) * DEG };
  }

  /**
   * @param {number} dt seconds
   * @param {import('../tracking/strokeDetector.js').StrokeDetector} det
   * @param {object} inp BatInput.state
   * @param {1|-1} hand
   */
  update(dt, det, inp, hand) {
    return this.mode === 'follow' ? this._follow(dt, det, inp, hand) : this._animated(dt, det, inp, hand);
  }

  _follow(dt, det, inp, hand) {
    const s = this.state;
    const tracked = !!inp?.tracked;
    // Ease between the live bat and the resting backlift when tracking comes and goes.
    this.live = clamp(this.live + (tracked ? dt / 0.15 : -dt / 0.5), 0, 1);
    // A frozen angle during a fast swing means the stick blurred away.
    if (tracked && this.lastAngle !== null && Math.abs(inp.angle - this.lastAngle) < 0.002) this.stale += dt;
    else this.stale = 0;
    this.lastAngle = tracked ? inp.angle : null;
    const cur = det.current();
    const swinging = cur && cur.peak >= Math.max(det.vOn * 1.6, 0.4 * det.ref);
    const blurred = swinging && this.stale > 0.05;
    if (blurred || this.anim) {
      if (!this.anim) this.anim = { onset: cur.onset, age: 0, vx: cur.vx, vy: cur.vy, from: { gx: inp.gx, gy: inp.gy, angle: inp.angle } };
      // Tracking came back after the swing: hand the bat straight back to it.
      if (!blurred && this.stale === 0 && this.anim.age > 0.08) this.anim = null;
    }
    if (this.anim) {
      const p = this._animated(dt, det, inp, hand, this.anim.from);
      if (!this.anim || this.anim.age > SWING + 0.15) this.anim = null;
      return p;
    }
    const rest = this.backlift(hand, null);
    const k = ease(this.live);
    s.gx = lerp(rest.gx, inp?.gx ?? rest.gx, k);
    s.gy = lerp(rest.gy, inp?.gy ?? rest.gy, k);
    s.angle = angLerp(rest.angle, inp?.angle ?? rest.angle, k);
    s.ratio = tracked ? inp.ratio : 0.9;
    return s;
  }

  _animated(dt, det, inp, hand, start = null) {
    const cur = det.current();
    // A real swing (not a fidget or a slow pick-up) starts the animation.
    const strong = cur && cur.peak >= Math.max(det.vOn * 1.6, 0.4 * det.ref);
    if (strong && (!this.anim || this.anim.onset !== cur.onset)) {
      this.anim = { onset: cur.onset, age: 0, vx: cur.vx, vy: cur.vy };
    }
    const a = this.anim;
    const rest = start || this.backlift(hand, inp);
    const s = this.state;
    if (!a) {
      s.gx = rest.gx;
      s.gy = rest.gy;
      s.angle = rest.angle;
      return s;
    }
    // Follow the swing's direction while it's still going.
    if (cur && cur.onset === a.onset) {
      a.vx = cur.vx;
      a.vy = cur.vy;
    }
    a.age += dt;
    const finish = Math.atan2(a.vy, a.vx);
    const contact = { gx: 0.15 * hand, gy: -0.35, angle: -90 * DEG };
    const follow = { gx: 0.55 * Math.cos(finish), gy: 0.45 * Math.sin(finish) + 0.35, angle: finish };
    let p;
    if (a.age < SWING) {
      const u = ease(a.age / SWING);
      const [from, to, k] = u < 0.5 ? [rest, contact, u * 2] : [contact, follow, (u - 0.5) * 2];
      p = { gx: lerp(from.gx, to.gx, k), gy: lerp(from.gy, to.gy, k), angle: angLerp(from.angle, to.angle, k) };
    } else if (a.age < SWING + HOLD) {
      p = follow;
    } else if (a.age < SWING + HOLD + BACK) {
      const k = ease((a.age - SWING - HOLD) / BACK);
      p = { gx: lerp(follow.gx, rest.gx, k), gy: lerp(follow.gy, rest.gy, k), angle: angLerp(follow.angle, rest.angle, k) };
    } else {
      this.anim = null;
      p = rest;
    }
    s.gx = p.gx;
    s.gy = p.gy;
    s.angle = p.angle;
    return s;
  }
}
