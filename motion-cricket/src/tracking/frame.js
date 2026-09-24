// Working copy of a camera frame for the stick tracker. The frame is
// downscaled on a canvas, converted to luma/chroma (Y, Cb, Cr) and lightly
// blurred, which calms sensor noise and newspaper print.

// Shading on a round stick mostly changes brightness, so brightness counts
// for less than colour when two pixels are compared.
export const Y_WEIGHT = 0.55;

export function ycc(r, g, b, out = [0, 0, 0]) {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  out[0] = y;
  out[1] = (b - y) * 0.564;
  out[2] = (r - y) * 0.713;
  return out;
}

export function colorDist(a, b) {
  const dy = (a[0] - b[0]) * Y_WEIGHT;
  const db = a[1] - b[1];
  const dr = a[2] - b[2];
  return Math.sqrt(dy * dy + db * db + dr * dr);
}

export class WorkFrame {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ycc = new Float32Array(width * height * 3);
    this.tmp = new Float32Array(width * height * 3);
  }

  /** Loads an RGBA buffer (width × height × 4) and blurs it 3×3. */
  load(rgba) {
    const w = this.width;
    const h = this.height;
    const a = this.tmp;
    const n = w * h;
    for (let i = 0, k = 0, j = 0; i < n; i++, k += 4, j += 3) {
      const r = rgba[k];
      const g = rgba[k + 1];
      const b = rgba[k + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      a[j] = y;
      a[j + 1] = (b - y) * 0.564;
      a[j + 2] = (r - y) * 0.713;
    }
    // Separable box blur: horizontal a → b, vertical b → a.
    const b = this.ycc;
    for (let y = 0; y < h; y++) {
      const row = y * w * 3;
      for (let x = 0; x < w; x++) {
        const l = row + (x > 0 ? x - 1 : x) * 3;
        const c = row + x * 3;
        const r = row + (x < w - 1 ? x + 1 : x) * 3;
        b[c] = (a[l] + a[c] + a[r]) / 3;
        b[c + 1] = (a[l + 1] + a[c + 1] + a[r + 1]) / 3;
        b[c + 2] = (a[l + 2] + a[c + 2] + a[r + 2]) / 3;
      }
    }
    const stride = w * 3;
    for (let y = 0; y < h; y++) {
      const up = (y > 0 ? y - 1 : y) * stride;
      const mid = y * stride;
      const dn = (y < h - 1 ? y + 1 : y) * stride;
      for (let x = 0; x < stride; x++) a[mid + x] = (b[up + x] + b[mid + x] + b[dn + x]) / 3;
    }
    // The blurred result is in `tmp`; swap so `ycc` holds it.
    this.tmp = b;
    this.ycc = a;
    return this;
  }

  /** Index of the pixel nearest (x, y) into `ycc`, or -1 outside the frame. */
  index(x, y) {
    const xi = (x + 0.5) | 0;
    const yi = (y + 0.5) | 0;
    if (x < -0.5 || y < -0.5 || xi >= this.width || yi >= this.height) return -1;
    return (yi * this.width + xi) * 3;
  }

  /** Y/Cb/Cr at (x, y), or null outside the frame. */
  sample(x, y, out = [0, 0, 0]) {
    const i = this.index(x, y);
    if (i < 0) return null;
    out[0] = this.ycc[i];
    out[1] = this.ycc[i + 1];
    out[2] = this.ycc[i + 2];
    return out;
  }
}
