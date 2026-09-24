// Tiny software rasterizer for tracker tests: draws a person holding (or
// not holding) a stick against a room background, plus MediaPipe-style
// hand landmarks that match the drawing.

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Canvas {
  constructor(w, h, seed = 7) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.rand = rng(seed);
  }

  put(x, y, [r, g, b], a = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const d = this.data;
    d[i] = d[i] * (1 - a) + r * a;
    d[i + 1] = d[i + 1] * (1 - a) + g * a;
    d[i + 2] = d[i + 2] * (1 - a) + b * a;
    d[i + 3] = 255;
  }

  background(kind) {
    const r = this.rand;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let c;
        if (kind === 'curtain') {
          // White curtain with soft vertical folds.
          const fold = Math.sin(x * 0.21) * 0.5 + Math.sin(x * 0.083 + 1.3) * 0.5;
          const v = 214 + fold * 16 + (r() - 0.5) * 8;
          c = [v, v, v + 3];
        } else if (kind === 'gray') {
          const v = 160 + (r() - 0.5) * 10;
          c = [v, v, v - 4];
        } else {
          // Beige wall.
          c = [205 + (r() - 0.5) * 8, 190 + (r() - 0.5) * 8, 170 + (r() - 0.5) * 8];
        }
        this.put(x, y, c);
      }
    }
  }

  ellipse(cx, cy, rx, ry, color, noise = 6) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.put(x, y, jitter(color, noise, this.rand));
      }
    }
  }

  /** Capsule from (x0,y0) to (x1,y1). `shade` darkens the edges like a cylinder. */
  capsule(x0, y0, x1, y1, width, color, { noise = 6, shade = 0.25, print = 0, alpha = 1 } = {}) {
    const minX = Math.floor(Math.min(x0, x1) - width);
    const maxX = Math.ceil(Math.max(x0, x1) + width);
    const minY = Math.floor(Math.min(y0, y1) - width);
    const maxY = Math.ceil(Math.max(y0, y1) + width);
    const vx = x1 - x0;
    const vy = y1 - y0;
    const l2 = vx * vx + vy * vy || 1;
    const hw = width / 2;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / l2));
        const px = x0 + vx * t;
        const py = y0 + vy * t;
        const d = Math.hypot(x - px, y - py);
        if (d > hw) continue;
        const k = 1 - shade * (d / hw) ** 2;
        let c = color.map((v) => v * k);
        if (print && this.rand() < print) c = c.map((v) => v * 0.55);
        this.put(x, y, jitter(c, noise, this.rand), alpha);
      }
    }
  }
}

function jitter(c, n, r) {
  return c.map((v) => v + (r() - 0.5) * n);
}

export const SKIN = [196, 146, 112];
export const DARK_SKIN = [150, 102, 74];
export const NEWSPAPER = [168, 166, 158];
export const WOOD = [186, 138, 88];
export const WHITE_SHIRT = [236, 236, 232];
export const NAVY_SHIRT = [36, 52, 96];

/**
 * 21 landmarks for a fist gripping a handle. `axis` points from the wrist
 * to the knuckles, `knuckles` from the little-finger knuckle to the index
 * knuckle (along the handle, towards the blade).
 */
export function fistLandmarks(palm, axis, knuckles, s, rand = Math.random, noise = 0.03) {
  const p = (ax, kn) => ({
    x: palm.x + axis.x * ax * s + knuckles.x * kn * s + (rand() - 0.5) * noise * s,
    y: palm.y + axis.y * ax * s + knuckles.y * kn * s + (rand() - 0.5) * noise * s,
  });
  const lm = new Array(21);
  lm[0] = p(-0.55, 0);
  lm[1] = p(-0.35, 0.35);
  lm[2] = p(-0.1, 0.5);
  lm[3] = p(0.1, 0.55);
  lm[4] = p(0.25, 0.5);
  const fingers = [
    [5, 0.35],
    [9, 0.12],
    [13, -0.12],
    [17, -0.35],
  ];
  for (const [base, kn] of fingers) {
    lm[base] = p(0.45, kn);
    lm[base + 1] = p(0.62, kn * 0.95);
    lm[base + 2] = p(0.5, kn * 0.9);
    lm[base + 3] = p(0.3, kn * 0.9);
  }
  return lm;
}

const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

/**
 * Draws a batter scene. Angles in degrees, image coordinates (y down,
 * 0° = right, -90° = up).
 *  - stickAngle: direction from the grip to the stick tip (null: no stick)
 *  - forearm: direction from the hand back to the elbow
 */
export function drawBatter({
  w = 448,
  h = 252,
  seed = 3,
  background = 'curtain',
  grip = { x: 224, y: 140 },
  s = 16,
  stickAngle = -90,
  stickLenRel = 5.5,
  stickColor = NEWSPAPER,
  stickWidthRel = 0.45,
  stickAlpha = 1,
  forearm = 110,
  forearm2 = 70,
  twoHands = true,
  armColor = SKIN,
  skin = SKIN,
  shirt = NAVY_SHIRT,
  print = 0.08,
} = {}) {
  const c = new Canvas(w, h, seed);
  c.background(background);
  // Torso behind the hands.
  c.ellipse(grip.x + 10, grip.y + 30, 5.5 * s, 7 * s, shirt);
  c.ellipse(grip.x + 10, grip.y - 5.2 * s, 1.4 * s, 1.7 * s, skin); // head
  const rad = (d) => (d * Math.PI) / 180;
  const stickDir = stickAngle === null ? null : { x: Math.cos(rad(stickAngle)), y: Math.sin(rad(stickAngle)) };
  // Two hands stacked along the handle (the lower one nearer the blade).
  const handPalms = [];
  if (twoHands && stickDir) {
    handPalms.push({ x: grip.x - stickDir.x * 0.5 * s, y: grip.y - stickDir.y * 0.5 * s });
    handPalms.push({ x: grip.x + stickDir.x * 0.5 * s, y: grip.y + stickDir.y * 0.5 * s });
  } else if (twoHands) {
    handPalms.push({ x: grip.x - 0.5 * s, y: grip.y }, { x: grip.x + 0.5 * s, y: grip.y });
  } else {
    handPalms.push({ ...grip });
  }
  const arms = [forearm, forearm2];
  const lms = [];
  handPalms.forEach((palm, i) => {
    const fa = arms[i] ?? forearm;
    const fdir = { x: Math.cos(rad(fa)), y: Math.sin(rad(fa)) };
    const elbow = { x: palm.x + fdir.x * 5 * s, y: palm.y + fdir.y * 5 * s };
    c.capsule(palm.x, palm.y, elbow.x, elbow.y, 0.8 * s, armColor, { shade: 0.2 });
    // The upper arm runs on towards the shoulder.
    c.capsule(elbow.x, elbow.y, grip.x + 10 + (i ? 3.5 : -3.5) * s, grip.y - 2.8 * s, 0.95 * s, armColor, { shade: 0.2 });
  });
  if (stickDir) {
    const tip = { x: grip.x + stickDir.x * stickLenRel * s, y: grip.y + stickDir.y * stickLenRel * s };
    const butt = { x: grip.x - stickDir.x * 1.3 * s, y: grip.y - stickDir.y * 1.3 * s };
    c.capsule(butt.x, butt.y, tip.x, tip.y, stickWidthRel * s, stickColor, { shade: 0.3, print, alpha: stickAlpha });
  }
  handPalms.forEach((palm, i) => {
    const fa = arms[i] ?? forearm;
    const fdir = { x: Math.cos(rad(fa)), y: Math.sin(rad(fa)) };
    c.ellipse(palm.x, palm.y, 0.62 * s, 0.62 * s, skin);
    const axis = { x: -fdir.x, y: -fdir.y };
    let kn = stickDir ? { ...stickDir } : unit(-axis.y, axis.x);
    lms.push(fistLandmarks(palm, axis, kn, s, c.rand));
  });
  const tip = stickDir
    ? { x: grip.x + stickDir.x * stickLenRel * s, y: grip.y + stickDir.y * stickLenRel * s }
    : null;
  return { rgba: c.data, w, h, hands: lms, tip, grip, s };
}
