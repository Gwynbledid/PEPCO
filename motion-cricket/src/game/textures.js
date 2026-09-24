import * as THREE from 'three';

// Procedural textures painted on canvases. Each has an optional image in
// public/assets/ (see ASSET_PROMPTS.md) that replaces it when present.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(canvas, { repeat = null, srgb = true, mirror = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    const wrap = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    t.wrapS = wrap;
    t.wrapT = wrap;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

/** Small deterministic RNG so the stadium looks the same every launch. */
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
const DISPLAY_FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';

/** Draws wrapped copies so the tile is seamless. */
function wrapDraw(size, x, y, pad, fn) {
  for (const ox of [0, -size, size]) {
    for (const oy of [0, -size, size]) {
      if (x + ox < -pad || x + ox > size + pad || y + oy < -pad || y + oy > size + pad) continue;
      fn(x + ox, y + oy);
    }
  }
}

/** Fine grass detail (tileable), a neutral mid-green used as a detail map. */
export function grassDetailCanvas(img = null) {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, S, S);
    return c;
  }
  g.fillStyle = '#6fb23a';
  g.fillRect(0, 0, S, S);
  const r = rng(7);
  const shades = ['#5aa02b', '#7cc043', '#8ccd4f', '#66ab33', '#9ad65c', '#4f9426', '#b2df72'];
  for (let i = 0; i < 16000; i++) {
    const x = r() * S;
    const y = r() * S;
    const len = 2 + r() * 5;
    const a = -Math.PI / 2 + (r() - 0.5) * 1.1;
    g.strokeStyle = pick(r, shades);
    g.globalAlpha = 0.45 + r() * 0.5;
    g.lineWidth = 0.8 + r() * 0.9;
    wrapDraw(S, x, y, 8, (px, py) => {
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      g.stroke();
    });
  }
  g.globalAlpha = 1;
  return c;
}

/**
 * The pitch strip, 3.05 m × 24.4 m: packed tan clay, cracks, dry grass,
 * worn patches and the painted creases. Returns {color, bump} canvases.
 */
export function pitchCanvases(img = null) {
  const W = 256;
  const H = 2048;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const b = makeCanvas(W, H);
  const gb = b.getContext('2d');
  const pxPerM = H / 24.4;
  const r = rng(11);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, W, H);
  if (img) {
    for (let y = 0; y < H; y += W) g.drawImage(img, 0, y, W, W);
  } else {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#b99a5e');
    grd.addColorStop(0.12, '#d6b77c');
    grd.addColorStop(0.5, '#dcbf86');
    grd.addColorStop(0.88, '#d6b77c');
    grd.addColorStop(1, '#b99a5e');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    // Grain and specks.
    for (let i = 0; i < 40000; i++) {
      const v = r();
      g.fillStyle =
        v < 0.45 ? 'rgba(150,112,60,0.16)' : v < 0.8 ? 'rgba(240,214,160,0.2)' : v < 0.93 ? 'rgba(120,150,70,0.14)' : 'rgba(95,70,40,0.2)';
      const s = 1 + r() * 2.5;
      const x = r() * W;
      const y = r() * H;
      g.fillRect(x, y, s, s);
      gb.fillStyle = v < 0.5 ? 'rgba(60,60,60,0.25)' : 'rgba(200,200,200,0.25)';
      gb.fillRect(x, y, s, s);
    }
    // Dry grass tufts near the edges.
    for (let i = 0; i < 1400; i++) {
      const edge = r() < 0.5 ? r() * 40 : W - r() * 40;
      g.strokeStyle = `rgba(${110 + r() * 40},${150 + r() * 30},${60 + r() * 20},0.5)`;
      g.lineWidth = 1;
      const y = r() * H;
      g.beginPath();
      g.moveTo(edge, y);
      g.lineTo(edge + (r() - 0.5) * 5, y - 3 - r() * 5);
      g.stroke();
    }
    // Hairline cracks, into both the colour and the bump.
    for (let i = 0; i < 110; i++) {
      let x = r() * W;
      let y = r() * H;
      g.strokeStyle = 'rgba(115,82,45,0.45)';
      gb.strokeStyle = 'rgba(20,20,20,0.7)';
      g.lineWidth = gb.lineWidth = 1;
      g.beginPath();
      gb.beginPath();
      g.moveTo(x, y);
      gb.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (r() - 0.5) * 20;
        y += (r() - 0.5) * 20;
        g.lineTo(x, y);
        gb.lineTo(x, y);
      }
      g.stroke();
      gb.stroke();
    }
  }
  const yOf = (m) => m * pxPerM;
  const xOf = (m) => W / 2 + (m / 3.05) * W;
  const farStumps = yOf(2.14);
  const nearStumps = yOf(24.4 - 2.14);
  // Worn footmarks where bowlers land and batters stand.
  const wear = (cy, rad) => {
    const grd = g.createRadialGradient(W / 2, cy, 5, W / 2, cy, rad);
    grd.addColorStop(0, 'rgba(140,100,55,0.4)');
    grd.addColorStop(1, 'rgba(140,100,55,0)');
    g.fillStyle = grd;
    g.fillRect(0, cy - rad, W, rad * 2);
    for (let i = 0; i < 90; i++) {
      const x = W / 2 + (r() - 0.5) * rad * 1.3;
      const y = cy + (r() - 0.5) * rad * 1.3;
      g.fillStyle = 'rgba(110,78,42,0.35)';
      g.beginPath();
      g.ellipse(x, y, 2 + r() * 4, 3 + r() * 5, r() * 3, 0, Math.PI * 2);
      g.fill();
      gb.fillStyle = 'rgba(30,30,30,0.35)';
      gb.beginPath();
      gb.ellipse(x, y, 2 + r() * 4, 3 + r() * 5, r() * 3, 0, Math.PI * 2);
      gb.fill();
    }
  };
  wear(farStumps + yOf(1.3), 110);
  wear(nearStumps - yOf(1.3), 110);
  // Creases (white paint).
  const paint = (x, y, w, h) => {
    g.fillStyle = 'rgba(255,255,252,0.96)';
    g.fillRect(x, y, w, h);
    gb.fillStyle = 'rgba(170,170,170,1)';
    gb.fillRect(x, y, w, h);
  };
  for (const [stumps, dir] of [
    [farStumps, 1],
    [nearStumps, -1],
  ]) {
    paint(0, stumps + dir * yOf(1.22) - 3, W, 6); // popping crease
    paint(xOf(-1.32), stumps - 3, xOf(1.32) - xOf(-1.32), 6); // bowling crease
    for (const rx of [-1.32, 1.32]) {
      const y0 = Math.min(stumps - dir * yOf(1.0), stumps + dir * yOf(1.22));
      paint(xOf(rx) - 3, y0, 6, yOf(2.22)); // return creases
    }
  }
  return { color: c, bump: b };
}

// Crowd colours: mostly home-team blue, as in the reference.
export const SHIRTS = [
  '#1f5fd1', '#1f5fd1', '#2a73e8', '#1747a8', '#3b8cff', '#1f5fd1', '#1a52b8', '#2a73e8',
  '#ff8a1f', '#ffffff', '#f4d23c', '#e84545', '#2fb36d', '#12306e', '#6ec3ff',
];
export const SKINS = ['#8d5a3b', '#a8704a', '#c68a5e', '#6e4228', '#d9a07a', '#b97b52', '#e3b08c'];
export const HAIRS = ['#1b1512', '#2b1d14', '#1b1512', '#3b2a1e', '#d9d4c8', '#1b1512', '#f2f2f2', '#1f3d8f'];

/**
 * Sprite atlas for the instanced crowd: 4 poses side by side. Channel masks:
 * red = shirt, green = skin, blue = hair or cap, alpha = shape. The shader
 * colours each spectator from those masks.
 */
export function crowdAtlasCanvas() {
  const FW = 128;
  const FH = 192;
  const c = makeCanvas(FW * 4, FH);
  const g = c.getContext('2d');
  const shirt = '#ff0000';
  const skin = '#00ff00';
  const hair = '#0000ff';
  for (let f = 0; f < 4; f++) {
    g.save();
    g.translate(f * FW + FW / 2, 0);
    // Torso (seated: shoulders and chest above the seat in front).
    g.fillStyle = shirt;
    g.beginPath();
    g.moveTo(-40, FH);
    g.bezierCurveTo(-44, 120, -36, 96, 0, 94);
    g.bezierCurveTo(36, 96, 44, 120, 40, FH);
    g.closePath();
    g.fill();
    // Arms per pose: 0 relaxed, 1 clapping, 2 both up cheering, 3 one fist up.
    g.lineCap = 'round';
    g.lineWidth = 17;
    const arm = (x0, y0, x1, y1, x2, y2) => {
      g.strokeStyle = shirt;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.strokeStyle = skin;
      g.lineWidth = 14;
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x2, y2, 9, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 17;
    };
    if (f === 1) {
      arm(-30, 108, -26, 140, -6, 128);
      arm(30, 108, 26, 140, 6, 130);
    } else if (f === 2) {
      arm(-30, 106, -44, 70, -48, 30);
      arm(30, 106, 44, 70, 48, 30);
    } else if (f === 3) {
      arm(30, 106, 42, 68, 40, 28);
    }
    // Neck, head, hair.
    g.fillStyle = skin;
    g.fillRect(-9, 76, 18, 22);
    g.beginPath();
    g.ellipse(0, 60, 24, 27, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(0, 50, 25, 20, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillRect(-25, 48, 50, 5);
    g.restore();
  }
  return c;
}

/** Seating surface under the crowd: rows of blue seats, concrete steps, aisles. */
export function seatsCanvas() {
  const W = 1024;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#c8bfae';
  g.fillRect(0, 0, W, H);
  const rows = 8;
  const rowH = H / rows;
  for (let row = 0; row < rows; row++) {
    const y0 = row * rowH;
    g.fillStyle = '#d9d1c1';
    g.fillRect(0, y0 + rowH * 0.78, W, rowH * 0.22);
    for (let x = 30; x < W - 6; x += 16) {
      g.fillStyle = row % 3 === 0 ? '#2a5fb8' : '#2b66c7';
      g.fillRect(x, y0 + rowH * 0.25, 12, rowH * 0.5);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y0 + rowH * 0.65, 12, rowH * 0.1);
    }
  }
  // Aisle at the tile edge, so it repeats as stairways.
  g.fillStyle = '#e4dccb';
  g.fillRect(0, 0, 24, H);
  g.fillStyle = '#bdb4a2';
  for (let y = 0; y < H; y += rowH / 2) g.fillRect(0, y, 24, 3);
  return c;
}

// Fictional sponsors. Real brands (or a real player's name) need a licence
// from their owner before the game goes on the Play Store.
export const SPONSORS = [
  { name: 'BOLT COLA', bg: ['#e8322f', '#b81f1d'], fg: '#ffffff' },
  { name: 'NOVA TILES', bg: ['#ffffff', '#e9e9e9'], fg: '#d0202f' },
  { name: 'SKYRIDE', bg: ['#2a63d4', '#173e98'], fg: '#ffffff' },
  { name: 'ZENTRA PAINTS', bg: ['#ffd23f', '#f2b705'], fg: '#1b2a5a' },
  { name: 'KRAFT BATS', bg: ['#10936a', '#0b6e50'], fg: '#ffffff' },
  { name: 'PEPCO', bg: ['#ffffff', '#eeeeee'], fg: '#0d6b73' },
];

export function boardCanvas(sponsor, img = null) {
  const c = makeCanvas(1024, 160);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, sponsor.bg[0]);
  grd.addColorStop(1, sponsor.bg[1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = sponsor.fg;
  g.font = `400 108px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(sponsor.name, c.width / 2, c.height / 2 + 6);
  // LED pixel grid, very faint.
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let x = 0; x < c.width; x += 4) g.fillRect(x, 0, 1, c.height);
  for (let y = 0; y < c.height; y += 4) g.fillRect(0, y, c.width, 1);
  return c;
}

/** Green roof fascia with bold lettering, as on the reference's pavilion. */
export function fasciaCanvas(text, img = null) {
  const c = makeCanvas(2048, 256);
  const g = c.getContext('2d');
  if (img) {
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const grd = g.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#1b9a7c');
  grd.addColorStop(0.55, '#128064');
  grd.addColorStop(1, '#0b5e4a');
  g.fillStyle = grd;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#f7fff9';
  g.font = `400 150px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowOffsetY = 6;
  g.fillText(text, c.width / 2, c.height / 2 + 8);
  g.shadowColor = 'transparent';
  g.fillStyle = '#f4c542';
  g.fillRect(0, 0, c.width, 12);
  g.fillRect(0, c.height - 12, c.width, 12);
  return c;
}

/** A thin LED ribbon for tier fronts. */
export function ribbonCanvas(text) {
  const c = makeCanvas(2048, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#10213f';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffd23f';
  g.font = `400 44px ${DISPLAY_FONT}`;
  g.textBaseline = 'middle';
  const words = text.split('·');
  let x = 20;
  let i = 0;
  while (x < c.width) {
    const w = words[i % words.length].trim();
    g.fillStyle = i % 2 ? '#ffffff' : '#ffd23f';
    g.fillText(w, x, 34);
    x += g.measureText(w).width + 80;
    i++;
  }
  return c;
}

/**
 * A big, soft cartoon cumulus: lit white tops, lavender-grey bellies and a
 * warm rim where the sun catches it. `light` is the side the sun is on
 * (-1 left .. 1 right).
 */
export function cloudCanvas(seed, light = -0.5) {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const r = rng(seed);
  const puffs = [];
  const n = 11 + Math.floor(r() * 7);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const hump = Math.sin(t * Math.PI) ** 0.8;
    const rad = 60 + hump * 125 + r() * 45;
    puffs.push({ x: 150 + t * (W - 300) + (r() - 0.5) * 60, y: H - 110 - hump * 95 - r() * 40, rad });
  }
  // Small puffs crowning the top.
  for (let i = 0; i < 7; i++) {
    const base = puffs[2 + Math.floor(r() * (n - 4))];
    puffs.push({ x: base.x + (r() - 0.5) * 120, y: base.y - base.rad * 0.55, rad: base.rad * (0.35 + r() * 0.25) });
  }
  const lx = light * 0.35;
  const blur = (px) => {
    if ('filter' in g) g.filter = `blur(${px}px)`;
  };
  // Shadowed belly.
  blur(5);
  for (const p of puffs) {
    g.fillStyle = '#c6cde4';
    g.beginPath();
    g.arc(p.x, p.y + 14, p.rad, 0, Math.PI * 2);
    g.fill();
  }
  // Mid tone, shifted towards the light.
  blur(3);
  for (const p of puffs) {
    g.fillStyle = '#e9eef9';
    g.beginPath();
    g.arc(p.x + lx * p.rad, p.y - p.rad * 0.12, p.rad * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  // Bright tops.
  blur(6);
  for (const p of puffs) {
    const grd = g.createRadialGradient(
      p.x + lx * p.rad * 1.4,
      p.y - p.rad * 0.45,
      p.rad * 0.05,
      p.x + lx * p.rad,
      p.y - p.rad * 0.25,
      p.rad * 0.8,
    );
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,253,248,0.85)');
    grd.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(p.x + lx * p.rad, p.y - p.rad * 0.25, p.rad * 0.8, 0, Math.PI * 2);
    g.fill();
  }
  blur(0);
  if ('filter' in g) g.filter = 'none';
  // Flatten the base with a soft fade.
  g.globalCompositeOperation = 'destination-out';
  const fade = g.createLinearGradient(0, H - 150, 0, H - 40);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = fade;
  g.fillRect(0, H - 150, W, 150);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/** Red leather ball with a raised white seam. */
export function ballCanvas() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 128);
  grd.addColorStop(0, '#c9262c');
  grd.addColorStop(0.5, '#b01e24');
  grd.addColorStop(1, '#8e151b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 128);
  const r = rng(3);
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,0,0'},0.05)`;
    g.fillRect(r() * 256, r() * 128, 2, 2);
  }
  g.fillStyle = '#f5ead6';
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
  grd.addColorStop(0, '#e2c28a');
  grd.addColorStop(0.5, '#f3dcaa');
  grd.addColorStop(1, '#ddbb80');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  const r = rng(5);
  g.strokeStyle = 'rgba(170,125,70,0.32)';
  for (let i = 0; i < 18; i++) {
    const x = 16 + (i / 17) * (W - 32) + (r() - 0.5) * 6;
    g.lineWidth = 1 + r();
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 4, H * 0.3, x - 4, H * 0.7, x + 2, H);
    g.stroke();
  }
  if (stickerImg) {
    g.drawImage(stickerImg, 0, H * 0.06, W, H * 0.64);
    return c;
  }
  // Sticker: navy swoosh, red outlined wordmark, gold star.
  g.save();
  g.translate(W / 2, H * 0.42);
  g.rotate(-Math.PI / 2);
  g.fillStyle = '#d0202f';
  g.font = `400 170px ${DISPLAY_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 14;
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.strokeText('KRAFT', 0, 0);
  g.fillText('KRAFT', 0, 0);
  g.restore();
  g.fillStyle = '#1b2a5a';
  g.beginPath();
  g.moveTo(30, H * 0.74);
  g.quadraticCurveTo(W / 2, H * 0.7, W - 30, H * 0.745);
  g.lineTo(W - 30, H * 0.765);
  g.quadraticCurveTo(W / 2, H * 0.725, 30, H * 0.76);
  g.fill();
  g.fillStyle = '#f4c542';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? 12 : 28;
    g.lineTo(W / 2 + Math.cos(a) * rad, H * 0.12 + Math.sin(a) * rad);
  }
  g.fill();
  return c;
}

/** Rubber bat grip: navy with a raised diamond pattern. */
export function gripCanvas() {
  const c = makeCanvas(128, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#1b2a5a';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.lineWidth = 3;
  for (let i = -256; i < 256; i += 18) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i + 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i + 128);
    g.lineTo(128, i);
    g.stroke();
  }
  return c;
}

/** Back of the batter's shirt: name and number, like the reference. */
export function jerseyCanvas(name = 'YOU', number = '18') {
  const W = 1024;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#ebe5d6';
  g.fillRect(0, 0, W, H);
  const r = rng(2);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.025})`;
    g.fillRect(r() * W, r() * H, 2, 2);
  }
  // u = 0.5 is the middle of the back.
  g.fillStyle = '#0b6e61';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `400 64px ${DISPLAY_FONT}`;
  g.fillText(String(name).toUpperCase().slice(0, 12), W / 2, H * 0.4);
  g.font = `400 170px ${DISPLAY_FONT}`;
  g.fillText(String(number).slice(0, 3), W / 2, H * 0.64);
  return c;
}

/** Floodlight bank: rows of glowing bulbs. */
export function floodlightCanvas() {
  const c = makeCanvas(256, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#343a46';
  g.fillRect(0, 0, 256, 128);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) {
      const cx = 18 + x * 31;
      const cy = 18 + y * 30;
      const grd = g.createRadialGradient(cx, cy, 1, cx, cy, 14);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.55, '#fff7de');
      grd.addColorStop(1, 'rgba(255,240,200,0.15)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(cx, cy, 13, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

export function glowCanvas() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,245,1)');
  grd.addColorStop(0.2, 'rgba(255,250,225,0.5)');
  grd.addColorStop(1, 'rgba(255,250,220,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return c;
}

export function softShadowCanvas() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.6)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Soft round dust puff. */
export function puffCanvas() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(226,196,140,0.9)');
  grd.addColorStop(0.6, 'rgba(216,184,126,0.4)');
  grd.addColorStop(1, 'rgba(210,180,120,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Normal map from a greyscale height canvas. */
export function normalFromHeight(canvas, strength = 2) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const og = out.getContext('2d');
  const img = og.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y - 1) - H(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  return out;
}
