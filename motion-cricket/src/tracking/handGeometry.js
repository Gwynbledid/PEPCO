// Geometry from MediaPipe hand landmarks (21 points per hand).
export const WRIST = 0;
export const INDEX_MCP = 5;
export const MIDDLE_MCP = 9;
export const RING_MCP = 13;
export const PINKY_MCP = 17;
const PALM = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/**
 * Palm centre, size and directions of one hand. `lm` is in pixels (any
 * consistent 2D space).
 *
 *  - scale: roughly the wrist → middle-knuckle distance (~9 cm on an adult
 *    hand), taken as the largest of several landmark pairs so it doesn't
 *    shrink much when the hand turns.
 *  - forearm: unit vector from the knuckles back towards the elbow. The
 *    stick can never point this way.
 *  - knuckles: unit vector from the little-finger knuckle to the index knuckle.
 */
export function analyzeHand(lm) {
  let px = 0;
  let py = 0;
  for (const i of PALM) {
    px += lm[i].x;
    py += lm[i].y;
  }
  const palm = { x: px / PALM.length, y: py / PALM.length };
  const scale = Math.max(
    dist(lm[WRIST], lm[MIDDLE_MCP]),
    dist(lm[WRIST], lm[INDEX_MCP]),
    dist(lm[WRIST], lm[PINKY_MCP]) / 0.9,
    dist(lm[INDEX_MCP], lm[PINKY_MCP]) / 0.78,
  );
  const forearm = unit(lm[WRIST].x - lm[MIDDLE_MCP].x, lm[WRIST].y - lm[MIDDLE_MCP].y);
  const knuckles = unit(lm[INDEX_MCP].x - lm[PINKY_MCP].x, lm[INDEX_MCP].y - lm[PINKY_MCP].y);
  return {
    lm,
    palm,
    scale,
    forearm,
    forearmAngle: Math.atan2(forearm.y, forearm.x),
    knuckles,
    knuckleSpan: dist(lm[INDEX_MCP], lm[PINKY_MCP]) / (scale || 1),
  };
}

/** Points inside the palm and on the back of the hand that are reliably skin. */
export function skinSamplePoints(h) {
  const { lm, palm } = h;
  const pts = [palm];
  for (const i of [INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP]) {
    pts.push({ x: (lm[WRIST].x + lm[i].x) / 2, y: (lm[WRIST].y + lm[i].y) / 2 });
    pts.push({ x: (palm.x + lm[i].x) / 2, y: (palm.y + lm[i].y) / 2 });
  }
  return pts;
}

/**
 * Hands-only mode (no stick): guesses the bat direction from the fist.
 * The line of the knuckles runs along a handle, and the blade comes out on
 * the index-finger side. The forearm side is ruled out, and a weak reading
 * (fist side-on to the camera) leans on the previous direction.
 * Returns a unit vector in the same space as the landmarks.
 */
export function batDirectionFromHands(hands, prev = { x: 0, y: 1 }) {
  let dx = 0;
  let dy = 0;
  let weight = 0;
  for (const h of hands) {
    let { x, y } = h.knuckles;
    const w = Math.min(1, Math.max(0, (h.knuckleSpan - 0.15) / 0.35));
    const intoArm = x * h.forearm.x + y * h.forearm.y;
    const alongPrev = x * prev.x + y * prev.y;
    if (intoArm > 0.3 || (intoArm > -0.3 && alongPrev < -0.5)) {
      x = -x;
      y = -y;
    }
    dx += x * w;
    dy += y * w;
    weight += w;
  }
  if (hands.length === 2) {
    // Two hands on a handle: the line between them is the handle.
    const a = hands[0].palm;
    const b = hands[1].palm;
    const l = dist(a, b);
    if (l > 0.5 * hands[0].scale) {
      let nx = (b.x - a.x) / l;
      let ny = (b.y - a.y) / l;
      if (nx * (dx || prev.x) + ny * (dy || prev.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      dx += nx * 1.5;
      dy += ny * 1.5;
      weight += 1.5;
    }
  }
  if (weight < 0.6) {
    dx += prev.x * (0.6 - weight) * 2;
    dy += prev.y * (0.6 - weight) * 2;
  }
  return unit(dx, dy);
}
