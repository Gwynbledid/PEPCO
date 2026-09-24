// Did the bat touch the ball? Tested on screen, where the player sees them:
// the bat as a line from handle to toe, the ball as a point, and "touching"
// as coming within `radius` of each other (ball + half the blade's width).
// Both move a long way in one frame during a swing, so the frame is split
// into sub-steps and the first touch wins.
//
// Screen units: normalized device coordinates with x multiplied by the
// aspect ratio, so distances are the same in every direction.

/** Distance from p to the segment a→b, and where along it (0 = a, 1 = b). */
export function pointToSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const u = len2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;
  return { dist: Math.hypot(a.x + abx * u - p.x, a.y + aby * u - p.y), u };
}

const mix = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

/**
 * @param {{top:{x,y}, toe:{x,y}}|null} bat0 the bat last frame (null: first frame)
 * @param {{top:{x,y}, toe:{x,y}}} bat1 the bat this frame
 * @param {{x,y}|null} ball0 the ball last frame
 * @param {{x,y}} ball1 the ball this frame
 * @param {number} radius touching distance
 * @param {number} [steps]
 * @returns {{k:number, u:number, dist:number}|null} k: when in the frame (0..1),
 *   u: where on the bat (0 = top of the line, 1 = toe)
 */
export function sweptTouch(bat0, bat1, ball0, ball1, radius, steps = 10) {
  const b0 = bat0 || bat1;
  const p0 = ball0 || ball1;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const r = pointToSegment(mix(p0, ball1, k), mix(b0.top, bat1.top, k), mix(b0.toe, bat1.toe, k));
    if (r.dist <= radius) return { k, u: r.u, dist: r.dist };
  }
  return null;
}
