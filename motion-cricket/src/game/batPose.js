// Where the first-person bat is drawn: exactly where the player's hands and
// stick are. No swing animation, no easing: the bat moves when and where the
// stick moves.
//
// The camera, hand tracking and screen together run about 0.1 s behind the
// real stick, so while the stick is moving the bat is drawn a little ahead
// along its motion (`lead` seconds), which puts it where the stick is now.
// When the stick is still there's nothing to predict, so it stays rock steady.
//
// The result is in the same form as BatInput.state, so the rig draws it.

import { TIMING } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class BatPose {
  constructor() {
    this.lead = TIMING.lead; // seconds of camera delay to make up
    this.state = { tracked: true, gx: 0, gy: 0, angle: -Math.PI / 2, ratio: 0.85 };
  }

  reset() {}

  /** @param {number} ms camera delay to make up, in milliseconds */
  setLead(ms) {
    this.lead = clamp((ms ?? TIMING.lead * 1000) / 1000, 0, 0.2);
  }

  /**
   * @param {object} inp BatInput.state (gx, gy, angle and their rates)
   * @param {number} age seconds since the camera frame `inp` came from
   */
  update(inp, age = 0) {
    const s = this.state;
    if (!inp) return s;
    // Predict only while moving: the faster, the more (so jitter at rest is
    // never amplified), and never further than one big step.
    const h = this.lead + clamp(age, 0, 0.05);
    const wa = clamp((Math.abs(inp.vangle || 0) - 1.2) / 3, 0, 1);
    const vp = Math.hypot(inp.vgx || 0, inp.vgy || 0);
    const wp = clamp((vp - 0.4) / 1.5, 0, 1);
    const da = inp.tracked ? clamp((inp.vangle || 0) * h * wa, -1.2, 1.2) : 0;
    const dx = inp.tracked ? clamp((inp.vgx || 0) * h * wp, -0.6, 0.6) : 0;
    const dy = inp.tracked ? clamp((inp.vgy || 0) * h * wp, -0.6, 0.6) : 0;
    s.tracked = !!inp.tracked;
    s.gx = inp.gx + dx;
    s.gy = inp.gy + dy;
    s.angle = inp.angle + da;
    s.ratio = inp.ratio ?? 0.85;
    return s;
  }
}
