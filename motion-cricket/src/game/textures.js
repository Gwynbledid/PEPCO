import * as THREE from 'three';

// Procedural stand-ins for every image asset. Each has an optional image in
// public/assets/ (see ASSET_PROMPTS.md) that replaces it when present.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(canvas, { repeat = null, srgb = true, mirror = false } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    const wrap = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.wrapS = wrap;
    t.wrapT = wrap;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// Small deterministic RNG so the stadium looks the same every launch.
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

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/** Tileable lush grass, drawn as thousands of short blade strokes. */
export function grassCanvas(img = null) {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, S, S);
    return c;
  }
  g.fillStyle = '#5cab2c';
  g.fillRect(0, 0, S, S);
  const r = rng(7);
  const shades = ['#4f9d24', '#68b834', '#77c33d', '#56a428', '#83cc47', '#4a9120'];
  for (let i = 0; i < 9000; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = 3 + r() * 6;
    const a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    g.strokeStyle = pick(r, shades);
    g.globalAlpha = 0.55 + r() * 0.45;
    g.lineWidth = 1 + r() * 0.8;
    // Draw wrapped copies so the tile is seamless.
    for (const ox of [0, -S, S]) {
      for (const oy of [0, -S, S]) {
        if (x + ox < -10 || x + ox > S + 10 || y + oy < -10 || y + oy > S + 10) continue;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
  }
  g.globalAlpha = 1;
  return c;
}

/** The pitch strip: packed tan soil plus crease markings, 3.05 m x 24.4 m. */
export function pitchCanvas(img = null) {
  const W = 256;
  const H = 2048;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const pxPerM = H / 24.4;
  if (img) {
    const tile = W;
    for (let y = 0; y < H; y += tile) g.drawImage(img, 0, y, tile, tile);
  } else {
    g.fillStyle = '#d8b476';
    g.fillRect(0, 0, W, H);
    const r = rng(11);
    for (let i = 0; i < 26000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? 'rgba(160,118,62,0.18)' : v < 0.8 ? 'rgba(236,206,150,0.22)' : 'rgba(120,150,70,0.12)';
      g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    // Hairline cracks.
    g.strokeStyle = 'rgba(120,84,40,0.35)';
    g.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      let x = r() * W;
      let y = r() * H;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (r() - 0.5) * 18;
        y += (r() - 0.5) * 18;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  // Worn patches where bowlers land and batters stand.
  const wear = (cy) => {
    const grd = g.createRadialGradient(W / 2, cy, 5, W / 2, cy, 120);
    grd.addColorStop(0, 'rgba(150,108,58,0.35)');
    grd.addColorStop(1, 'rgba(150,108,58,0)');
    g.fillStyle = grd;
    g.fillRect(0, cy - 130, W, 260);
  };
  // Local v: 0 at the far (bowler) end. Stumps sit 2.14 m in from each end.
  const yOf = (m) => m * pxPerM;
  const farStumps = yOf(2.14);
  const nearStumps = yOf(24.4 - 2.14);
  wear(farStumps + yOf(1.4));
  wear(nearStumps - yOf(1.4));
  // Crease markings (white paint).
  g.fillStyle = 'rgba(255,255,255,0.95)';
  const line = (y) => g.fillRect(0, y - 3, W, 6);
  const xOf = (m) => W / 2 + (m / 3.05) * W;
  for (const [stumps, dir] of [
    [farStumps, 1],
    [nearStumps, -1],
  ]) {
    line(stumps + dir * yOf(1.22)); // popping crease
    g.fillRect(xOf(-1.32), stumps - 3, xOf(1.32) - xOf(-1.32), 6); // bowling crease
    for (const rx of [-1.32, 1.32]) {
      const y0 = Math.min(stumps - dir * yOf(1.0), stumps + dir * yOf(1.22));
      g.fillRect(xOf(rx) - 3, y0, 6, yOf(2.22)); // return creases
    }
  }
  return c;
}

const SHIRTS = [
  '#1f5fd1', '#1f5fd1', '#2a73e8', '#1747a8', '#3b8cff', '#1f5fd1',
  '#ff8a1f', '#ffffff', '#f4d23c', '#e84545', '#2fb36d', '#12306e',
];
const SKINS = ['#8d5a3b', '#a8704a', '#c68a5e', '#6e4228', '#d9a07a', '#b97b52'];

/** Tileable crowd: rows of seated fans, mostly in team blue. */
export function crowdCanvas(img = null) {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, W, H);
    return c;
  }
  const r = rng(21);
  g.fillStyle = '#26324a';
  g.fillRect(0, 0, W, H);
  const rows = 12;
  const rowH = H / rows;
  for (let row = 0; row < rows; row++) {
    const y0 = row * rowH;
    // Concrete step + seat backs.
    g.fillStyle = '#c9c3b6';
    g.fillRect(0, y0 + rowH - 6, W, 6);
    g.fillStyle = '#2e5aa8';
    g.fillRect(0, y0 + rowH * 0.45, W, rowH * 0.4);
    const step = 26;
    const off = (row % 2) * (step / 2);
    for (let x = 30 + off; x < W - 8; x += step) {
      if (r() < 0.07) continue; // empty seat
      const px = x + (r() - 0.5) * 4;
      const shirt = pick(r, SHIRTS);
      const skin = pick(r, SKINS);
      const bodyTop = y0 + rowH * 0.36;
      // Body.
      g.fillStyle = shirt;
      g.beginPath();
      g.roundRect(px - 9, bodyTop, 18, rowH * 0.5, 7);
      g.fill();
      // Arms up, cheering.
      if (r() < 0.12) {
        g.strokeStyle = shirt;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(px - 7, bodyTop + 4);
        g.lineTo(px - 12, bodyTop - 14);
        g.moveTo(px + 7, bodyTop + 4);
        g.lineTo(px + 12, bodyTop - 14);
        g.stroke();
      }
      // Head + hair.
      g.fillStyle = skin;
      g.beginPath();
      g.arc(px, bodyTop - 5, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = r() < 0.2 ? '#f2f2f2' : '#1b1512';
      g.beginPath();
      g.arc(px, bodyTop - 7, 7, Math.PI, Math.PI * 2);
      g.fill();
      // Flags now and then.
      if (r() < 0.02) {
        g.fillStyle = '#ff9933';
        g.fillRect(px + 8, bodyTop - 26, 16, 5);
        g.fillStyle = '#ffffff';
        g.fillRect(px + 8, bodyTop - 21, 16, 5);
        g.fillStyle = '#138808';
        g.fillRect(px + 8, bodyTop - 16, 16, 5);
      }
    }
  }
  // Aisle with steps on the tile edge, so it repeats as stairways.
  g.fillStyle = '#d9d3c4';
  g.fillRect(0, 0, 22, H);
  g.fillStyle = '#b7b0a1';
  for (let y = 0; y < H; y += rowH / 2) g.fillRect(0, y, 22, 3);
  return c;
}

// Fictional sponsors. Using real brands (or a real player's name) needs a
// licence from their owner before publishing on the Play Store.
export const SPONSORS = [
  { name: 'BOLT COLA', bg: '#e02b2b', fg: '#ffffff' },
  { name: 'NOVA TILES', bg: '#ffffff', fg: '#d0202f' },
  { name: 'SKYRIDE', bg: '#1d4fb8', fg: '#ffffff' },
  { name: 'ZENTRA PAINTS', bg: '#ffcf1f', fg: '#1b2a5a' },
  { name: 'KRAFT BATS', bg: '#0d7a55', fg: '#ffffff' },
  { name: 'PEPCO', bg: '#ffffff', fg: '#0d6b73' },
];

export function boardCanvas(sponsor, img = null) {
  const c = makeCanvas(1024, 160);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  g.fillStyle = sponsor.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = sponsor.fg;
  g.font = '900 104px "Lilita One", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sponsor.name, c.width / 2, c.height / 2 + 6);
  // Subtle sheen along the top edge.
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, 'rgba(255,255,255,0.18)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0)');
  grd.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Green roof fascia banner (the "PREMIUM ..." band in the reference). */
export function roofBannerCanvas(img = null) {
  const c = makeCanvas(2048, 192);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#16876f');
  grd.addColorStop(1, '#0c5f4f');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#eafff7';
  g.font = '900 110px "Lilita One", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('PREMIUM PAVILION', c.width / 2, c.height / 2 + 6);
  g.fillStyle = '#f4c542';
  g.fillRect(0, 0, c.width, 10);
  g.fillRect(0, c.height - 10, c.width, 10);
  return c;
}

/** A soft, puffy cartoon cumulus with a white top and a lilac-grey belly. */
export function cloudCanvas(seed) {
  const W = 512;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  const puffs = [];
  const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = 70 + t * (W - 140) + (r() - 0.5) * 30;
    const hump = Math.sin(t * Math.PI);
    const rad = 38 + hump * 55 + r() * 20;
    const y = H - 60 - hump * 40 - r() * 20;
    puffs.push({ x, y, rad });
  }
  // Belly shadow pass, then lit pass slightly higher.
  for (const p of puffs) {
    const grd = g.createRadialGradient(p.x, p.y + 10, p.rad * 0.2, p.x, p.y + 10, p.rad);
    grd.addColorStop(0, 'rgba(206,214,236,1)');
    grd.addColorStop(0.85, 'rgba(196,205,232,0.95)');
    grd.addColorStop(1, 'rgba(196,205,232,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(p.x, p.y + 10, p.rad, 0, Math.PI * 2);
    g.fill();
  }
  for (const p of puffs) {
    const grd = g.createRadialGradient(p.x - p.rad * 0.25, p.y - p.rad * 0.35, p.rad * 0.1, p.x, p.y - 6, p.rad * 0.92);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.7, 'rgba(250,251,255,0.95)');
    grd.addColorStop(1, 'rgba(240,244,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(p.x, p.y - 6, p.rad * 0.92, 0, Math.PI * 2);
    g.fill();
  }
  // Flatten the base.
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, H - 70, 0, H - 30);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, H - 70, W, 70);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Red leather ball with a white seam, as an equirectangular map. */
export function ballCanvas() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#c0272d');
  grd.addColorStop(0.5, '#a51c22');
  grd.addColorStop(1, '#8a151b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#f3e7d3';
  g.fillRect(0, 60, 256, 8);
  g.fillStyle = '#7a1015';
  for (let x = 0; x < 256; x += 6) {
    g.fillRect(x, 56, 3, 3);
    g.fillRect(x + 3, 69, 3, 3);
  }
  return c;
}

/** Willow bat face with a fictional brand sticker. */
export function batFaceCanvas(stickerImg = null) {
  const W = 256;
  const H = 1024;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, '#e4c48e');
  grd.addColorStop(0.5, '#f1d9a8');
  grd.addColorStop(1, '#e0bd84');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // Willow grain.
  const r = rng(5);
  g.strokeStyle = 'rgba(170,125,70,0.35)';
  for (let i = 0; i < 16; i++) {
    const x = 20 + (i / 15) * (W - 40) + (r() - 0.5) * 6;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 4, H * 0.3, x - 4, H * 0.7, x + 2, H);
    g.stroke();
  }
  if (stickerImg) {
    g.drawImage(stickerImg, 0, H * 0.08, W, H * 0.62);
  } else {
    g.save();
    g.translate(W / 2, H * 0.4);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#d0202f';
    g.font = '900 150px "Lilita One", "Arial Black", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#ffffff';
    g.strokeText('KRAFT', 0, 0);
    g.fillText('KRAFT', 0, 0);
    g.restore();
    g.fillStyle = '#1b2a5a';
    g.fillRect(24, H * 0.72, W - 48, 18);
  }
  return c;
}

/** Floodlight panel: a grid of glowing bulbs. */
export function floodlightCanvas() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#3b4250';
  g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 7; x++) {
      const cx = 22 + x * 35;
      const cy = 24 + y * 40;
      const grd = g.createRadialGradient(cx, cy, 2, cx, cy, 17);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, '#fff6d8');
      grd.addColorStop(1, 'rgba(255,240,200,0.2)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, 16, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

export function glowCanvas() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,245,0.95)');
  grd.addColorStop(0.25, 'rgba(255,250,220,0.45)');
  grd.addColorStop(1, 'rgba(255,250,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export function shadowCanvas() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}
