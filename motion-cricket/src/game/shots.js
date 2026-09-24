import { TIMING } from './config.js';

// Turns the measured swing into a shot. The ball goes the way the bat moves:
//
//  - Direction: a swing within ~20° of vertical is hit straight. Swing across
//    to the right and the ball goes right, across to the left and it goes
//    left, up to square. Timing bends it further: early pulls it to the leg
//    side, late pushes it to the off side, and very late or edged goes behind
//    the wicket. Together that covers every direction.
//  - Height: bat moving UP through the ball = lofted shot. Bat moving DOWN or
//    level = along the ground (hit into the turf, so it can't be caught).
//  - Power: swing speed compared with the player's own calibrated full swing,
//    times timing quality. Perfect timing is what clears the rope.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 0..1 quality from the timing error in seconds. */
export function timingQuality(e) {
  const a = Math.abs(e);
  if (a <= TIMING.perfect) return 1;
  return 1 - 0.75 * clamp((a - TIMING.perfect) / 0.18, 0, 1);
}

export function timingLabel(e, contact = 'middle') {
  if (contact === 'edge') return 'Edged';
  const a = Math.abs(e);
  if (a <= TIMING.perfect) return 'Perfect timing';
  if (a <= TIMING.good) return 'Good timing';
  return e < 0 ? 'Early' : 'Late';
}

/**
 * @param {object} p
 * @param {number} p.vx, p.vy  bat velocity at the peak of the swing (y up)
 * @param {number} [p.fx], [p.fy]  follow-through after the peak
 * @param {number} p.peak  peak swing speed
 * @param {number} p.ref   the player's full-swing speed from calibration
 * @param {number} p.e     timing error, seconds (<0 early, >0 late)
 * @param {1|-1} p.hand    1 = right-handed batter
 * @param {'middle'|'edge'} [p.contact]
 * @param {() => number} [p.rand]
 */
export function shotFromSwing({ vx, vy, fx = 0, fy = 0, peak, ref, e, hand, contact = 'middle', rand = Math.random }) {
  const power = clamp(peak / ref, 0, 1.15);
  const sp = Math.hypot(vx, vy) || 1;
  const h = vx / sp;
  const fl = Math.hypot(fx, fy);
  // Upward-ness: the bat's direction at the peak, nudged by the follow-through.
  const up = clamp(vy / sp + (fl > 0.3 ? (fy / fl) * 0.35 : 0), -1, 1);
  const q = timingQuality(e);

  // A slow push at the ball: a defensive block that drops near the pitch.
  if (power < 0.35) {
    const az = clamp(h * 45, -60, 60);
    return finish({
      azimuth: az,
      elevation: -6,
      speed: 3 + 10 * power,
      power,
      loft: false,
      defensive: true,
      contact,
      e,
      hand,
    });
  }

  const side = Math.sign(h) * clamp((Math.abs(h) - 0.3) / 0.7, 0, 1);
  const lateness = Math.sign(e) * clamp((Math.abs(e) - 0.03) / 0.12, 0, 1.4);
  let azimuth = side * 100 + hand * lateness * 45 + (rand() - 0.5) * 6;
  let loft = up > 0.2;
  let elevation = loft ? 20 + 20 * clamp((up - 0.2) / 0.8, 0, 1) + rand() * 4 : -3 + rand() * 2;
  let speed = loft ? 13 + 25 * power * q : 12 + 24 * power * q;

  if (contact === 'edge') {
    // Outside edge flies to third man, inside edge to fine leg.
    const outside = e >= 0 ? 1 : -1;
    azimuth = outside * hand * (135 + rand() * 35);
    speed *= 0.55;
    loft = rand() < 0.5;
    elevation = loft ? 8 + rand() * 14 : -2 + rand() * 4;
  }
  return finish({
    azimuth: clamp(azimuth, -178, 178),
    elevation,
    speed,
    power,
    loft,
    defensive: false,
    contact,
    e,
    hand,
  });
}

function finish(s) {
  return {
    ...s,
    quality: timingQuality(s.e),
    timing: s.defensive ? 'Defended' : timingLabel(s.e, s.contact),
    name: s.defensive ? 'Defensive block' : shotName(s.azimuth * s.hand, s.loft, s.contact),
  };
}

/** Cricket name of a shot from its angle as seen by a right-hander (+ = off side). */
export function shotName(a, loft, contact = 'middle') {
  if (contact === 'edge') return a > 0 ? 'Edge to third man' : 'Inside edge';
  const abs = Math.abs(a);
  const off = a > 0;
  let name;
  if (abs < 12) name = 'Straight drive';
  else if (abs < 35) name = off ? 'Off drive' : 'On drive';
  else if (abs < 70) name = off ? 'Cover drive' : 'Flick';
  else if (abs < 105) name = off ? 'Square cut' : loft ? 'Hook' : 'Pull';
  else if (abs < 140) name = off ? 'Late cut' : 'Sweep';
  else name = off ? 'Upper cut' : 'Glance';
  if (loft && name !== 'Hook' && name !== 'Upper cut') name = `Lofted ${name.toLowerCase()}`;
  return name;
}
