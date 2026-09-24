import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOARD_RADIUS, FIELD_CENTER, STAND_RADIUS } from './config.js';
import {
  SPONSORS,
  boardCanvas,
  fasciaCanvas,
  floodlightCanvas,
  glowCanvas,
  makeCanvas,
  ribbonCanvas,
  rng,
  seatsCanvas,
  toTexture,
} from './textures.js';

// The bowl: boundary boards, two tiers of stands under a cantilever roof with
// a green fascia, a grand pavilion with its own banner, floodlight towers
// and sight screens.
//
// Angles `a` are measured around the middle of the ground: a = 0 is straight
// down the pitch behind the bowler, +90° to the batter's right.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const PAVILION = { a: 40 * DEG, half: 24 * DEG };

// Stand profile (distance from the middle of the ground, height).
export const TIERS = {
  lower: { r0: STAND_RADIUS + 0.5, y0: 2.2, r1: STAND_RADIUS + 16, y1: 9.8, rows: 14 },
  upper: { r0: STAND_RADIUS + 18, y0: 12.4, r1: STAND_RADIUS + 31, y1: 19.2, rows: 12 },
};

export const at = (a, r, y = 0) =>
  new THREE.Vector3(FIELD_CENTER.x + Math.sin(a) * r, y, FIELD_CENTER.z - Math.cos(a) * r);

// Lathe/cylinder "phi" is measured from +z; our a = 0 points to -z.
const phiOf = (a) => a + Math.PI;

export function buildStadium(scene, assets, { quality }) {
  const group = new THREE.Group();
  scene.add(group);
  const segs = quality.stadiumSegments;

  const lathe = (pts, material, { from = -Math.PI, to = Math.PI } = {}) => {
    const geo = new THREE.LatheGeometry(
      pts.map(([r, y]) => new THREE.Vector2(r, y)),
      Math.max(8, Math.round((segs * (to - from)) / TAU)),
      phiOf(from),
      to - from,
    );
    const m = new THREE.Mesh(geo, material);
    m.position.set(FIELD_CENTER.x, 0, FIELD_CENTER.z);
    group.add(m);
    return m;
  };

  const concrete = new THREE.MeshStandardMaterial({ color: 0xe8dfcd, roughness: 0.92, side: THREE.DoubleSide });
  const wallPaint = new THREE.MeshStandardMaterial({ color: 0x0f6a5a, roughness: 0.8, side: THREE.DoubleSide });
  const seatsTex = toTexture(seatsCanvas(), { repeat: [70, 2] });
  const seats = new THREE.MeshStandardMaterial({ map: seatsTex, roughness: 0.9, side: THREE.DoubleSide });
  const seatsUpper = seats.clone();
  seatsUpper.map = seatsTex.clone();
  seatsUpper.map.repeat.set(84, 2);
  seatsUpper.map.needsUpdate = true;
  const roofTop = new THREE.MeshStandardMaterial({ color: 0xdfe5ea, roughness: 0.6, side: THREE.DoubleSide });
  const roofUnder = new THREE.MeshStandardMaterial({
    map: toTexture(trussCanvas(), { repeat: [120, 1] }),
    color: 0x9aa3ae,
    roughness: 0.8,
    side: THREE.DoubleSide,
  });

  const L = TIERS.lower;
  const U = TIERS.upper;
  lathe([[STAND_RADIUS, 0], [STAND_RADIUS, L.y0]], wallPaint);
  lathe([[STAND_RADIUS, L.y0], [STAND_RADIUS + 0.5, L.y0]], concrete);
  lathe([[L.r0, L.y0], [L.r1, L.y1]], seats);
  lathe([[L.r1, L.y1], [L.r1, L.y1 + 0.6], [U.r0, L.y1 + 0.6]], concrete);
  lathe([[U.r0, L.y1 + 0.6], [U.r0, U.y0]], concrete);
  lathe([[U.r0, U.y0], [U.r1, U.y1]], seatsUpper);
  lathe([[U.r1, U.y1], [U.r1, 24.2], [U.r1 + 1, 24.2]], concrete);
  // Cantilever roof over the upper tier (not over the pavilion).
  const roofOpts = { from: PAVILION.a + PAVILION.half, to: PAVILION.a - PAVILION.half + TAU };
  lathe([[U.r1 + 1, 24], [U.r0 - 1, 22.9]], roofUnder, roofOpts);
  lathe([[U.r0 - 1, 23.7], [U.r1 + 1, 25.3]], roofTop, roofOpts);

  // LED ribbon along the front of the upper tier.
  const ribbon = toTexture(ribbonCanvas('MOTION CRICKET · BOLT COLA · SKYRIDE · KRAFT BATS · NOVA TILES · ZENTRA PAINTS'), {
    repeat: [-6, 1],
  });
  const ribbonMat = new THREE.MeshStandardMaterial({
    map: ribbon,
    emissive: 0xffffff,
    emissiveMap: ribbon,
    emissiveIntensity: 0.55,
    side: THREE.BackSide,
  });
  const ribbonMesh = new THREE.Mesh(new THREE.CylinderGeometry(L.r1 - 0.02, L.r1 - 0.02, 1.1, segs, 1, true), ribbonMat);
  ribbonMesh.position.set(FIELD_CENTER.x, L.y1 + 0.9, FIELD_CENTER.z);
  group.add(ribbonMesh);

  // Roof fascia: green bands with lettering, in sections.
  const texts = ['EAST STAND', 'SKYRIDE', 'MOTION CRICKET', 'BOLT COLA', 'WEST STAND', 'KRAFT BATS', 'NOVA TILES'];
  const from = PAVILION.a + PAVILION.half;
  const span = TAU - PAVILION.half * 2;
  const n = texts.length;
  for (let i = 0; i < n; i++) {
    const a0 = from + (span * i) / n;
    const tex = toTexture(fasciaCanvas(texts[i], assets.roofBanner && i === 2 ? assets.roofBanner : null));
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1;
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.12,
      side: THREE.BackSide,
    });
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(U.r0 - 1.05, U.r0 - 1.05, 2.8, Math.max(6, Math.round((segs * span) / n / TAU)), 1, true, phiOf(a0), span / n),
      mat,
    );
    band.position.set(FIELD_CENTER.x, 23.4, FIELD_CENTER.z);
    group.add(band);
  }

  buildPavilion(group, assets);
  buildBoards(group, assets);
  buildSightScreens(group);
  buildFloodlights(group, quality);
  const flags = buildFlags(group);
  return { group, flags };
}

function trussCanvas() {
  const c = makeCanvas(64, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#b7bec8';
  g.fillRect(0, 0, 64, 256);
  g.strokeStyle = '#7d8793';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(32, 0);
  g.lineTo(32, 256);
  g.stroke();
  g.lineWidth = 2;
  for (let y = 0; y < 256; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(64, y + 32);
    g.stroke();
  }
  return c;
}

/** The members' pavilion: a taller, grander stand with the PREMIUM banner. */
function buildPavilion(group, assets) {
  const { a, half } = PAVILION;
  const U = TIERS.upper;
  const segs = 40;
  const phi0 = phiOf(a - half);
  const len = half * 2;
  const cyl = (r, h, y, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs, 1, true, phi0, len), mat);
    m.position.set(FIELD_CENTER.x, y, FIELD_CENTER.z);
    group.add(m);
    return m;
  };
  const cream = new THREE.MeshStandardMaterial({
    map: toTexture(facadeCanvas(), { repeat: [-6, 1] }),
    roughness: 0.85,
    side: THREE.BackSide,
  });
  cyl(U.r1 + 0.6, 9, 23.4, cream);
  // Banner: bigger than the regular fascia.
  const tex = toTexture(fasciaCanvas('PREMIUM PAVILION', assets.roofBanner));
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  cyl(
    U.r0 - 1.6,
    4.2,
    26.4,
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.5, side: THREE.BackSide }),
  );
  // Roof slab.
  const roof = new THREE.Mesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(U.r0 - 1.6, 28.5), new THREE.Vector2(U.r1 + 1.2, 30.2), new THREE.Vector2(U.r1 + 1.2, 28.5), new THREE.Vector2(U.r0 - 1.6, 24.3)],
      segs,
      phi0,
      len,
    ),
    new THREE.MeshStandardMaterial({ color: 0x0f7a60, roughness: 0.6, side: THREE.DoubleSide }),
  );
  roof.position.set(FIELD_CENTER.x, 0, FIELD_CENTER.z);
  group.add(roof);
  // Golden finials and pennants along the top.
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.35, metalness: 0.6 });
  const pennant = new THREE.MeshStandardMaterial({ color: 0xffc933, roughness: 0.6, side: THREE.DoubleSide });
  const flagGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -1.1, 0),
    new THREE.Vector3(1.9, -0.55, 0),
  ]);
  flagGeo.computeVertexNormals();
  for (let i = 0; i <= 6; i++) {
    const aa = a - half + (i / 6) * half * 2;
    const base = at(aa, U.r0 - 1.2, 29.2);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.2, 8), gold);
    pole.position.copy(base).add(new THREE.Vector3(0, 1.6, 0));
    group.add(pole);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), gold);
    tip.position.copy(base).add(new THREE.Vector3(0, 3.3, 0));
    group.add(tip);
    const f = new THREE.Mesh(flagGeo, pennant);
    f.position.copy(base).add(new THREE.Vector3(0, 3.1, 0));
    f.rotation.y = -aa + Math.PI / 2;
    f.userData.wave = i;
    group.add(f);
  }
}

function facadeCanvas() {
  const c = makeCanvas(512, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#efe6d3';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 4; i++) {
    const x = 30 + i * 120;
    g.fillStyle = '#35506e';
    g.beginPath();
    g.moveTo(x, 200);
    g.lineTo(x, 110);
    g.arc(x + 35, 110, 35, Math.PI, 0);
    g.lineTo(x + 70, 200);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x + 33, 80, 4, 120);
  }
  g.fillStyle = '#d8ccb4';
  g.fillRect(0, 214, 512, 10);
  return c;
}

function buildBoards(group, assets) {
  const n = Math.round((TAU * BOARD_RADIUS) / 6.6);
  const w = (TAU * BOARD_RADIUS) / n;
  const perSponsor = SPONSORS.map(() => []);
  const plane = new THREE.PlaneGeometry(w * 1.004, 1.0);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    // Keep the sight screens clear.
    if (Math.abs(Math.sin(a)) < 0.14) continue;
    const p = at(a, BOARD_RADIUS, 0.5);
    const g = plane.clone();
    m.lookAt(p, new THREE.Vector3(FIELD_CENTER.x, 0.5, FIELD_CENTER.z), new THREE.Vector3(0, 1, 0));
    // lookAt makes -z face the target; planes face +z.
    m.multiply(new THREE.Matrix4().makeRotationY(Math.PI));
    m.setPosition(p);
    g.applyMatrix4(m);
    perSponsor[i % SPONSORS.length].push(g);
  }
  SPONSORS.forEach((s, i) => {
    if (!perSponsor[i].length) return;
    const tex = toTexture(boardCanvas(s, assets[`sponsor${i + 1}`]));
    const mesh = new THREE.Mesh(
      mergeGeometries(perSponsor[i]),
      new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.5 }),
    );
    group.add(mesh);
  });
  // Backing frame.
  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(BOARD_RADIUS + 0.12, BOARD_RADIUS + 0.12, 1.1, 180, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.8, side: THREE.DoubleSide }),
  );
  back.position.set(FIELD_CENTER.x, 0.55, FIELD_CENTER.z);
  group.add(back);
}

function buildSightScreens(group) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xf7f7f1, roughness: 0.85 });
  for (const a of [0, Math.PI]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 0.5), mat);
    s.position.copy(at(a, BOARD_RADIUS + 2.5, 4.5));
    s.lookAt(FIELD_CENTER.x, 4.5, FIELD_CENTER.z);
    s.castShadow = false;
    group.add(s);
  }
}

function buildFloodlights(group, quality) {
  const panelTex = toTexture(floodlightCanvas());
  const glowTex = toTexture(glowCanvas());
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.45, metalness: 0.5 });
  const panelMat = new THREE.MeshStandardMaterial({
    map: panelTex,
    emissive: 0xffffff,
    emissiveMap: panelTex,
    emissiveIntensity: quality.post ? 4 : 1.6,
    roughness: 0.4,
  });
  for (const a of [42 * DEG, -42 * DEG, 138 * DEG, -138 * DEG]) {
    const base = at(a, STAND_RADIUS + 38, 0);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, 60, 12), steel);
    mast.position.copy(base).add(new THREE.Vector3(0, 30, 0));
    group.add(mast);
    const head = new THREE.Group();
    head.position.copy(base).add(new THREE.Vector3(0, 61, 0));
    head.lookAt(FIELD_CENTER.x, 8, FIELD_CENTER.z);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(17, 9, 1.2), steel);
    head.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), panelMat);
    face.position.z = 0.62;
    head.add(face);
    group.add(head);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.85 }),
    );
    glow.position.copy(head.position).lerp(new THREE.Vector3(FIELD_CENTER.x, 61, FIELD_CENTER.z), 0.02);
    glow.scale.set(38, 26, 1);
    group.add(glow);
  }
}

/** Pennants along the roof line that flutter in the breeze. */
function buildFlags(group) {
  const U = TIERS.upper;
  const r = rng(4);
  const colors = [0xffc933, 0xff7a3d, 0x18a999, 0xffffff];
  const flagGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.9, 0),
    new THREE.Vector3(1.6, -0.45, 0),
  ]);
  flagGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0.5]), 2));
  flagGeo.computeVertexNormals();
  const count = 70;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3][0] * 0.3 + instanceMatrix[3][2] * 0.2;
        transformed.z += sin(uTime * 5.0 + ph + uv.x * 3.0) * 0.35 * uv.x;`,
      );
  };
  const flags = new THREE.InstancedMesh(flagGeo, mat, count);
  const poles = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  let i = 0;
  for (let k = 0; k < count; k++) {
    const a = (k / count) * TAU;
    if (Math.abs(((a - PAVILION.a + Math.PI) % TAU) - Math.PI) < PAVILION.half) continue;
    const base = at(a, U.r0 + 1, 25.3);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a + Math.PI / 2 + (r() - 0.5) * 0.4);
    m.compose(base.clone().add(new THREE.Vector3(0, 2.6, 0)), q, one);
    flags.setMatrixAt(i, m);
    flags.setColorAt(i, c.set(colors[k % colors.length]));
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5);
    pole.translate(base.x, base.y + 1.3, base.z);
    poles.push(pole);
    i++;
  }
  flags.count = i;
  group.add(flags);
  group.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 0.4, roughness: 0.5 })));
  return {
    update(t) {
      if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t;
    },
  };
}
