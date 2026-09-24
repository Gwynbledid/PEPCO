import { Y_WEIGHT, colorDist } from './frame.js';
import { analyzeHand, skinSamplePoints } from './handGeometry.js';

// Finds the stick (newspaper roll, broom handle, toy bat…) held in the
// player's fist, so the bat on screen follows the stick itself, not the arm.
//
// From the fist, rays are cast in every direction and each ray is scored
// for "is there a thin bar here?":
//   - the pixel on the ray looks like the stick (a colour learned during
//     calibration, or the ray's own colour just outside the fist),
//   - it stands out from the pixels on BOTH sides of it (a stick is thin;
//     a wall or a shirt is not),
//   - it isn't skin (arms and the other hand),
//   - and the bar has to start right at the fist.
// The longest well-scored run wins. Directions along the forearm are ruled
// out, and between frames the search prefers where the stick was heading.
// All coordinates are pixels of the (un-mirrored) working frame.

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const COARSE_STEP = 4 * DEG;
const GOOD = 0.3; // per-sample score that counts as "on the stick"
const BAR_LO = 7; // colour contrast (weighted Y/Cb/Cr distance) where a bar starts to count
const BAR_HI = 20; // …and where it counts fully

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrap = (a) => {
  let d = (a + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
};
export const angDiff = (a, b) => Math.abs(wrap(a - b));

const median = (arr) => {
  if (!arr.length) return 0;
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (arr, m) => median(arr.map((v) => Math.abs(v - m)));

export class StickTracker {
  constructor() {
    this.model = null; // learned stick appearance, see finishLearning()
    this.skin = { cb: -20, cr: 26 };
    this.scale = 0; // smoothed hand size in pixels
    this.lock = null; // last accepted detection
    this.learning = null;
  }

  setModel(model) {
    this.model = model || null;
    this.lock = null;
  }

  reset() {
    this.lock = null;
  }

  // ---------------------------------------------------------------------
  // Per-frame tracking

  /**
   * @param {import('./frame.js').WorkFrame} frame
   * @param {Array<Array<{x:number,y:number}>>} handsLm landmarks in frame pixels
   * @param {number} t seconds
   */
  update(frame, handsLm, t) {
    const hands = handsLm.map(analyzeHand);
    this._observeHands(frame, hands);
    const lock = this.lock && t - this.lock.t < 0.35 ? this.lock : null;
    const configs = this._configs(hands, lock, t);
    if (!configs.length) return this._miss(hands);

    const ctx = this._context(lock, t);
    let best = null;
    for (const cfg of configs) {
      const c = cfg.predicted ? { ...ctx, predSigma: 30 * DEG, predFloor: 0.08 } : ctx;
      const r = this._search(frame, cfg, c);
      if (r && (!best || r.value > best.value)) best = r;
    }
    if (!best) return this._miss(hands);

    const conf = this._confidence(best);
    if (best.cfg.predicted && conf < 0.45) return this._miss(hands);
    if (lock && angDiff(best.theta, ctx.pred) > 100 * DEG && conf < 0.6) return this._miss(hands);

    const origin = best.cfg.origin;
    const dt = lock ? Math.max(1e-3, t - lock.t) : 0;
    const angVel = lock ? wrap(best.theta - lock.angle) / dt : 0;
    const ov = lock
      ? { x: (origin.x - lock.origin.x) / dt, y: (origin.y - lock.origin.y) / dt }
      : { x: 0, y: 0 };
    this.lock = {
      t,
      angle: best.theta,
      angVel: lock ? lock.angVel * 0.4 + Math.max(-40, Math.min(40, angVel)) * 0.6 : 0,
      origin: { ...origin },
      ov: lock ? { x: lock.ov.x * 0.4 + ov.x * 0.6, y: lock.ov.y * 0.4 + ov.y * 0.6 } : ov,
      scale: best.cfg.scale,
      conf,
    };
    const ux = Math.cos(best.theta);
    const uy = Math.sin(best.theta);
    return {
      found: true,
      conf,
      predicted: !!best.cfg.predicted,
      origin: { ...origin },
      tip: { x: origin.x + ux * best.tipR, y: origin.y + uy * best.tipR },
      angle: best.theta,
      tipR: best.tipR,
      lengthRel: best.tipR / best.cfg.scale,
      scale: best.cfg.scale,
      clipped: best.clipped,
      hands,
    };
  }

  _miss(hands) {
    return { found: false, conf: 0, hands, scale: this.scale };
  }

  _context(lock, t) {
    const model = this.model;
    const ctx = {
      model,
      skinSuppress: !model || model.skinSuppress !== false,
      maxLenRel: model ? Math.max(4, model.lengthRel * 1.35) : 8,
      pred: null,
      predSigma: 45 * DEG,
      predFloor: 0.35,
      window: null,
    };
    if (lock) {
      const dt = t - lock.t;
      ctx.pred = lock.angle + Math.max(-1.2, Math.min(1.2, lock.angVel * dt));
    }
    return ctx;
  }

  _observeHands(frame, hands) {
    if (!hands.length) return;
    // Smoothed hand size: the stick's width and length are measured in it.
    const s = hands.reduce((a, h) => a + h.scale, 0) / hands.length;
    this.scale = this.scale ? this.scale * 0.7 + s * 0.3 : s;
    // Skin colour, from points that are reliably on the hand.
    const cb = [];
    const cr = [];
    const c = [0, 0, 0];
    for (const h of hands) {
      for (const p of skinSamplePoints(h)) {
        if (frame.sample(p.x, p.y, c) && c[0] > 25) {
          cb.push(c[1]);
          cr.push(c[2]);
        }
      }
    }
    if (cb.length >= 4) {
      this.skin.cb = this.skin.cb * 0.7 + median(cb) * 0.3;
      this.skin.cr = this.skin.cr * 0.7 + median(cr) * 0.3;
    }
  }

  _configs(hands, lock, t) {
    const scale = this.scale;
    if (hands.length >= 2) {
      const [a, b] = hands;
      const d = Math.hypot(a.palm.x - b.palm.x, a.palm.y - b.palm.y);
      if (d < 3.2 * scale) {
        const origin = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };
        return [{ origin, hands: [a, b], scale, startTol: 1.0 }];
      }
      // Hands apart: only one of them is on the stick.
      return [
        { origin: a.palm, hands: [a], scale, startTol: 1.6 },
        { origin: b.palm, hands: [b], scale, startTol: 1.6 },
      ];
    }
    if (hands.length === 1) return [{ origin: hands[0].palm, hands, scale, startTol: 1.6 }];
    // Hands lost (motion blur in a fast swing): look where the grip should be.
    if (lock && t - lock.t < 0.3) {
      const dt = t - lock.t;
      const origin = { x: lock.origin.x + lock.ov.x * dt, y: lock.origin.y + lock.ov.y * dt };
      return [{ origin, hands: [], scale: lock.scale, startTol: 1.6, predicted: true }];
    }
    return [];
  }

  _confidence(r) {
    const expected = this.model ? this.model.lengthRel * 0.7 : 4;
    const lenRel = r.len / r.cfg.scale;
    return clamp01((lenRel - 1.2) / Math.max(0.8, expected - 1.2)) * clamp01((r.meanQ - 0.22) / 0.33);
  }

  _prior(theta, cfg, ctx) {
    if (ctx.window && angDiff(theta, ctx.window.center) > ctx.window.half) return 0;
    let p = 1;
    for (const h of cfg.hands) {
      // Never along the forearm.
      const d = angDiff(theta, h.forearmAngle);
      if (d < 45 * DEG) p *= 0.03 + 0.97 * smooth(22 * DEG, 45 * DEG, d);
    }
    if (ctx.pred !== null) {
      const d = angDiff(theta, ctx.pred);
      p *= ctx.predFloor + (1 - ctx.predFloor) * Math.exp(-(d * d) / (2 * ctx.predSigma * ctx.predSigma));
    }
    return p;
  }

  _search(frame, cfg, ctx) {
    let best = null;
    const consider = (theta) => {
      const p = this._prior(theta, cfg, ctx);
      if (p <= 0.02) return null;
      const r = this._ray(frame, cfg, theta, ctx);
      if (!r) return null;
      r.value = r.score * p;
      r.cfg = cfg;
      if (!best || r.value > best.value) best = r;
      return r;
    };
    const n = Math.round(TAU / COARSE_STEP);
    for (let i = 0; i < n; i++) consider(-Math.PI + i * COARSE_STEP);
    if (!best) return null;
    const center = best.theta;
    for (const d of [-3, -2, -1, 1, 2, 3]) consider(center + d * DEG);
    if (best.meanQ < 0.28) return null;
    return best;
  }

  /** Walks one ray out of the fist and scores it as a stick. */
  _ray(frame, cfg, theta, ctx, collect = null, trace = null) {
    const { ycc } = frame;
    const s = cfg.scale;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const nx = -uy;
    const ny = ux;
    const ox = cfg.origin.x;
    const oy = cfg.origin.y;
    // Start just outside the fist (or the further fist, with two hands).
    let r0 = 0.8 * s;
    for (const h of cfg.hands) r0 = Math.max(r0, (h.palm.x - ox) * ux + (h.palm.y - oy) * uy + 0.8 * h.scale);
    const step = Math.max(1, s / 10);
    const rMax = r0 + ctx.maxLenRel * s;
    const w1 = Math.min(18, Math.max(2.5, 0.6 * s));
    const w2 = w1 * 1.6;
    const jit = Math.max(1, 0.12 * s);
    const model = ctx.model;
    const skin = this.skin;

    // Without a learned colour, the ray's own colour just outside the fist
    // is the reference.
    let rY = 0;
    let rB = 0;
    let rR = 0;
    if (!model) {
      let n = 0;
      for (let r = r0; r < r0 + s; r += step) {
        const i = frame.index(ox + ux * r, oy + uy * r);
        if (i < 0) break;
        rY += ycc[i];
        rB += ycc[i + 1];
        rR += ycc[i + 2];
        n++;
      }
      if (!n) return null;
      rY /= n;
      rB /= n;
      rR /= n;
    }

    const sideContrast = (cY, cB, cR, x, y) => {
      const k = frame.index(x, y);
      if (k < 0) return 0;
      const dy = (cY - ycc[k]) * Y_WEIGHT;
      const db = cB - ycc[k + 1];
      const dr = cR - ycc[k + 2];
      return Math.sqrt(dy * dy + db * db + dr * dr);
    };
    // Score of the pixel at (cx, cy) as part of a stick along this ray.
    const q = (cx, cy) => {
      const c = frame.index(cx, cy);
      if (c < 0) return -1;
      const cY = ycc[c];
      const cB = ycc[c + 1];
      const cR = ycc[c + 2];
      let sim;
      if (model) {
        const zy = (cY - model.y) / model.sy;
        const zb = (cB - model.cb) / model.scb;
        const zr = (cR - model.cr) / model.scr;
        const z = Math.sqrt(zy * zy + zb * zb + zr * zr);
        sim = z <= 1.2 ? 1 : Math.exp(-0.5 * (z - 1.2) * (z - 1.2));
      } else {
        const dy = (cY - rY) * Y_WEIGHT;
        const db = cB - rB;
        const dr = cR - rR;
        sim = Math.exp(-(dy * dy + db * db + dr * dr) / 800);
      }
      if (sim < 0.05) return 0;
      const left = Math.max(
        sideContrast(cY, cB, cR, cx + nx * w1, cy + ny * w1),
        sideContrast(cY, cB, cR, cx + nx * w2, cy + ny * w2),
      );
      const right = Math.max(
        sideContrast(cY, cB, cR, cx - nx * w1, cy - ny * w1),
        sideContrast(cY, cB, cR, cx - nx * w2, cy - ny * w2),
      );
      const bar = smooth(BAR_LO, BAR_HI, Math.min(left, right));
      let skinFactor = 1;
      if (ctx.skinSuppress && cY > 25) {
        const zb = (cB - skin.cb) / 8;
        const zr = (cR - skin.cr) / 8;
        skinFactor = 1 - 0.85 * Math.exp(-0.5 * (zb * zb + zr * zr));
      }
      return bar * sim * skinFactor;
    };

    let acc = 0;
    let accGood = 0;
    let first = -1;
    let last = -1; // end of the stick so far
    let prevGood = -1;
    let clipped = false;
    const startTol = (cfg.startTol || 1) * s;
    for (let r = r0; r <= rMax; r += step) {
      const cx = ox + ux * r;
      const cy = oy + uy * r;
      let v = q(cx, cy);
      if (v < 0) {
        clipped = true;
        break;
      }
      if (v < 0.6) v = Math.max(v, q(cx + nx * jit, cy + ny * jit), q(cx - nx * jit, cy - ny * jit));
      if (trace) trace.push([r, v]);
      if (v > GOOD) {
        if (first < 0) first = last = r;
        // After a gap, one stray pixel doesn't extend the stick; two in a row do.
        else if (r - last <= 1.5 * step || r - prevGood <= 1.5 * step) last = r;
        prevGood = r;
      }
      if (first < 0) {
        if (r - r0 > startTol) return null; // a stick starts at the fist
        continue;
      }
      acc += v;
      if (v > GOOD && last === r) {
        accGood = acc;
        if (collect) collect(cx, cy, nx, ny, w2);
      }
      // Print on a newspaper, or the other hand, can break the bar briefly.
      const gap = last - r0 < 1.5 * s ? 1.4 * s : 0.6 * s;
      if (r - last > Math.max(3, gap)) break;
    }
    if (first < 0 || last - r0 < 1.2 * s) return null;
    const count = Math.max(1, Math.round((last - first) / step) + 1);
    return { theta, r0, tipR: last, len: last - r0, score: accGood, meanQ: accGood / count, clipped };
  }

  // ---------------------------------------------------------------------
  // Learning the stick's look (calibration): the player holds the stick
  // upright, so only upward directions are searched.

  beginLearning() {
    this.model = null;
    this.lock = null;
    this.learning = { stick: [[], [], []], bg: [[], [], []], lens: [], frames: 0 };
  }

  learnFrame(frame, handsLm) {
    const L = this.learning;
    const hands = handsLm.map(analyzeHand);
    this._observeHands(frame, hands);
    const configs = this._configs(hands, null, 0);
    if (!configs.length) return { found: false, hands, frames: L.frames };
    // Skin isn't suppressed while learning: the stick may be wooden.
    const ctx = {
      ...this._context(null, 0),
      model: null,
      skinSuppress: false,
      window: { center: -90 * DEG, half: 55 * DEG },
    };
    let best = null;
    for (const cfg of configs) {
      const r = this._search(frame, cfg, ctx);
      if (r && (!best || r.value > best.value)) best = r;
    }
    if (!best || best.len < 2 * best.cfg.scale || best.meanQ < 0.35) {
      return { found: false, hands, frames: L.frames };
    }
    const c = [0, 0, 0];
    const push = (arr, x, y) => {
      if (frame.sample(x, y, c)) {
        arr[0].push(c[0]);
        arr[1].push(c[1]);
        arr[2].push(c[2]);
      }
    };
    this._ray(frame, best.cfg, best.theta, ctx, (x, y, nx, ny, w) => {
      push(L.stick, x, y);
      push(L.bg, x + nx * w, y + ny * w);
      push(L.bg, x - nx * w, y - ny * w);
    });
    L.lens.push(best.tipR / best.cfg.scale);
    L.frames++;
    const ux = Math.cos(best.theta);
    const uy = Math.sin(best.theta);
    const o = best.cfg.origin;
    return {
      found: true,
      hands,
      frames: L.frames,
      angle: best.theta,
      origin: { ...o },
      tip: { x: o.x + ux * best.tipR, y: o.y + uy * best.tipR },
    };
  }

  /** Builds the stick model from what learnFrame() collected. */
  finishLearning() {
    const L = this.learning;
    if (!L || L.frames < 5) return null;
    const ms = L.stick.map(median);
    const mb = L.bg.map(median);
    const ds = L.stick.map((a, i) => 1.4826 * mad(a, ms[i]));
    const db = L.bg.map((a, i) => 1.4826 * mad(a, mb[i]));
    const spread = (d) => Math.sqrt((d[0] * Y_WEIGHT) ** 2 + d[1] ** 2 + d[2] ** 2);
    const contrast = colorDist(ms, mb) / (0.5 * (spread(ds) + spread(db)) + 4);
    const zb = (ms[1] - this.skin.cb) / 8;
    const zr = (ms[2] - this.skin.cr) / 8;
    const skinLike = Math.exp(-0.5 * (zb * zb + zr * zr)) > 0.25;
    const lens = Float64Array.from(L.lens).sort();
    const model = {
      y: ms[0],
      cb: ms[1],
      cr: ms[2],
      sy: Math.max(20, ds[0] * 1.6),
      scb: Math.max(6, ds[1] * 1.6),
      scr: Math.max(6, ds[2] * 1.6),
      // A wooden (skin-coloured) stick must not be suppressed as skin.
      skinSuppress: !skinLike,
      lengthRel: lens[Math.min(lens.length - 1, Math.floor(lens.length * 0.8))],
      contrast,
      quality: contrast >= 1.8 ? 'good' : contrast >= 1.1 ? 'ok' : 'poor',
    };
    this.learning = null;
    this.setModel(model);
    return model;
  }
}
