// Tracks a brightly coloured marker (tape, a ball or a sock) on the end of a
// stick by colour. It samples a small downscaled copy of the frame, which is
// cheap enough for phones.
const W = 160;
const H = 120;

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max / 255];
}

const hueDist = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export class MarkerTracker {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.target = null; // { h, sMin, vMin, hTol }
    this.last = null;
  }

  get calibrated() {
    return this.target !== null;
  }

  setTarget(target) {
    this.target = target;
    this.last = null;
  }

  _grab(video) {
    this.ctx.drawImage(video, 0, 0, W, H);
    return this.ctx.getImageData(0, 0, W, H).data;
  }

  /**
   * Samples the colour inside a circle (normalized, un-mirrored image coords).
   * Returns the learned target, or null if nothing colourful enough was there.
   */
  sample(video, cx, cy, radius) {
    const data = this._grab(video);
    const hues = [];
    let sSum = 0;
    let vSum = 0;
    let total = 0;
    const r2 = (radius * W) ** 2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = x - cx * W;
        const dy = y - cy * H;
        if (dx * dx + dy * dy > r2) continue;
        total++;
        const i = (y * W + x) * 4;
        const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        if (s > 0.35 && v > 0.25) {
          hues.push(h);
          sSum += s;
          vSum += v;
        }
      }
    }
    if (total === 0 || hues.length < total * 0.2) return null;
    // Circular mean of the hue.
    let sx = 0;
    let sy = 0;
    for (const h of hues) {
      sx += Math.cos((h * Math.PI) / 180);
      sy += Math.sin((h * Math.PI) / 180);
    }
    let h = (Math.atan2(sy, sx) * 180) / Math.PI;
    if (h < 0) h += 360;
    const s = sSum / hues.length;
    const v = vSum / hues.length;
    return { h, hTol: 16, sMin: Math.max(0.3, s * 0.55), vMin: Math.max(0.18, v * 0.45) };
  }

  /** Returns { x, y, count } in normalized un-mirrored image coords, or null. */
  track(video) {
    if (!this.target) return null;
    const data = this._grab(video);
    const { h: th, hTol, sMin, vMin } = this.target;
    // Search near the last position first so other objects of the same colour
    // elsewhere in the room are less likely to steal the lock.
    const win = this.last ? 0.3 : 1;
    const x0 = this.last ? Math.max(0, Math.floor((this.last.x - win) * W)) : 0;
    const x1 = this.last ? Math.min(W, Math.ceil((this.last.x + win) * W)) : W;
    const y0 = this.last ? Math.max(0, Math.floor((this.last.y - win) * H)) : 0;
    const y1 = this.last ? Math.min(H, Math.ceil((this.last.y + win) * H)) : H;
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        if (s >= sMin && v >= vMin && hueDist(h, th) <= hTol) {
          sx += x;
          sy += y;
          n++;
        }
      }
    }
    if (n < 6) {
      this.last = null;
      return null;
    }
    this.last = { x: (sx / n + 0.5) / W, y: (sy / n + 0.5) / H, count: n };
    return this.last;
  }
}
