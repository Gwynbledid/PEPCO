// Turns a swing into a shot.
//
//  - Direction: the ball goes the way the bat moves. A vertical swing is
//    hit straight, a swing to the right goes right, and a swing to the left
//    goes left. Timing bends it further: early goes to the leg side, late
//    goes to the off side, very late or an edge goes behind the wicket.
//  - Height: an upward swing (hands rising through the ball) is a lofted
//    shot. A downward or level swing keeps it on the ground.
//  - Power: swing speed relative to the player's calibrated swing, times
//    timing quality.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {object} p
 * @param {number} p.vx, p.vy  bat-head velocity (calibrated units/s, y up)
 * @param {number} p.peak      peak bat-head speed during the swing
 * @param {number} p.e         timing error in seconds (<0 early, >0 late)
 * @param {'middle'|'edge'} p.contact
 * @param {1|-1} p.hand        1 = right-handed batter, -1 = left-handed
 * @param {number} p.refSpeed  the player's calibrated full-swing speed
 * @param {() => number} [p.rand]
 */
export function describeShot({ vx, vy, peak, e, contact, hand, refSpeed, rand = Math.random }) {
  const speed = Math.hypot(vx, vy) || 1;
  const h = vx / speed; // -1 left .. +1 right
  const u = vy / speed; // -1 down .. +1 up
  const en = clamp(e / 0.08, -2, 2);
  // Perfect timing is what clears the rope; mistimed shots lose a lot of power.
  const timingQuality = 1 - 0.28 * Math.min(Math.abs(en), 2);

  // Angle from straight down the ground; + is to the batter's right (world +x).
  // Swings within ~20° of vertical count as straight, and nobody swings
  // perfectly vertically, so the sideways part only kicks in beyond that.
  const side = Math.sign(h) * Math.max(0, (Math.abs(h) - 0.35) / 0.65);
  // Near-perfect timing keeps a straight swing straight.
  const bend = Math.abs(en) < 0.5 ? 0 : en - Math.sign(en) * 0.5;
  let theta = side * 100 + bend * 30 * hand + (rand() - 0.5) * 8;
  let loft = u > 0.2;
  let power = clamp(peak / refSpeed, 0.35, 1.15) * timingQuality;
  // Ground shots are hit down into the turf so they bounce early and can't be caught.
  let elevation = loft ? 24 + 14 * clamp(u, 0, 1) + rand() * 4 : -4 + rand() * 4;

  if (contact === 'edge') {
    // Outside edge flies off to third man, inside edge to fine leg.
    const outside = en >= 0 ? 1 : -1;
    theta = outside * hand * (138 + rand() * 32);
    power *= 0.5;
    loft = rand() < 0.5;
    elevation = loft ? 10 + rand() * 12 : 2 + rand() * 4;
  }
  theta = clamp(theta, -178, 178);
  const exitSpeed = loft ? 12 + 17 * power : 11 + 20 * power;

  return {
    theta,
    elevation,
    speed: exitSpeed,
    power,
    loft,
    name: shotName(theta * hand, loft, contact),
    timing: contact === 'edge' ? 'Edged' : Math.abs(e) < 0.035 ? 'Perfect timing' : e < 0 ? 'Early' : 'Late',
  };
}

/** Cricket name for a shot, from the angle as seen by a right-hander. */
export function shotName(a, loft, contact) {
  if (contact === 'edge') return a > 0 ? 'Edge to third man' : 'Inside edge';
  const abs = Math.abs(a);
  const off = a > 0;
  let name;
  if (abs < 15) name = 'Straight drive';
  else if (abs < 40) name = off ? 'Off drive' : 'On drive';
  else if (abs < 75) name = off ? 'Cover drive' : 'Flick';
  else if (abs < 105) name = off ? 'Square cut' : loft ? 'Hook' : 'Pull';
  else if (abs < 140) name = off ? 'Late cut' : 'Sweep';
  else name = off ? 'Upper cut' : 'Glance';
  if (loft && name !== 'Hook' && name !== 'Upper cut') name = `Lofted ${name.toLowerCase()}`;
  return name;
}
