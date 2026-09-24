import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Stylized, chunky cricketers (animated-film proportions: big head and
// hands, soft shapes, a warm rim light). Built from primitives, merged per
// joint so each character is ~20 draw calls. Local space: the character
// faces +Z, its left is +X, feet at y = 0.

// ---------------------------------------------------------------------------
// Materials

const matCache = new Map();

/** Standard material with a soft rim light, cached by its settings. */
export function toonMaterial(color, { roughness = 0.78, metalness = 0, rim = 0.35, map = null, side = THREE.FrontSide } = {}) {
  const key = map ? null : `${color}_${roughness}_${metalness}_${rim}_${side}`;
  if (key && matCache.has(key)) return matCache.get(key);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, map, side });
  addRim(mat, rim);
  if (key) matCache.set(key, mat);
  return mat;
}

export function addRim(mat, strength = 0.35, color = 0xfff0d8) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(color) };
    shader.uniforms.rimStrength = { value: strength };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor;\nuniform float rimStrength;')
      .replace(
        '#include <opaque_fragment>',
        `float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
        outgoingLight += rimColor * rimF * rimStrength * (0.35 + diffuseColor.rgb);
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => `rim_${strength}`;
  return mat;
}

// ---------------------------------------------------------------------------
// Geometry helpers

const sphere = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r, len, cs = 6, rs = 14) => new THREE.CapsuleGeometry(r, len, cs, rs);

/** Applies a local transform to a geometry (position, euler, scale). */
function place(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.applyMatrix4(m);
}

/** Collects parts per bone and material, then merges them. */
class PartBuilder {
  constructor() {
    this.parts = new Map(); // bone -> Map(material -> geos)
  }

  add(bone, geo, mat, t) {
    const g = place(geo.index ? geo : geo, t);
    if (!this.parts.has(bone)) this.parts.set(bone, new Map());
    const byMat = this.parts.get(bone);
    if (!byMat.has(mat)) byMat.set(mat, []);
    // Merging needs the same attributes everywhere.
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    byMat.get(mat).push(g.index ? g : g);
  }

  build() {
    for (const [bone, byMat] of this.parts) {
      for (const [mat, geos] of byMat) {
        const merged = mergeGeometries(geos.map((g) => (g.index ? g : g)));
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        bone.add(mesh);
      }
    }
  }
}

function bone(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// ---------------------------------------------------------------------------
// Character

export const LIMBS = { upper: 0.28, lower: 0.25 };

/**
 * @param {object} o
 * @param {'cap'|'helmet'|'hat'|'none'} [o.headwear]
 * @param {THREE.Texture} [o.jersey] texture for the shirt (name and number on the back)
 */
export function createCharacter(o = {}) {
  const P = new PartBuilder();
  const shirtMat = o.jersey
    ? addRim(new THREE.MeshStandardMaterial({ color: 0xffffff, map: o.jersey, roughness: 0.85 }), 0.3)
    : toonMaterial(o.shirt ?? 0xebe5d6, { roughness: 0.85, rim: 0.3 });
  const sleeve = toonMaterial(o.shirt ?? 0xebe5d6, { roughness: 0.85, rim: 0.3 });
  const trousers = toonMaterial(o.trousers ?? 0xe4dccb, { roughness: 0.88, rim: 0.3 });
  const skin = toonMaterial(o.skin ?? 0xb97a4f, { roughness: 0.55, rim: 0.4 });
  const hair = toonMaterial(o.hair ?? 0x1c1410, { roughness: 0.9, rim: 0.2 });
  const shoe = toonMaterial(0xeeeeea, { roughness: 0.5 });
  const spikes = toonMaterial(0x7c828a, { roughness: 0.4, metalness: 0.5, rim: 0 });
  const accent = toonMaterial(o.accent ?? 0x0b6e61, { roughness: 0.6 });
  const eyeWhite = toonMaterial(0xffffff, { roughness: 0.3, rim: 0 });
  const iris = toonMaterial(0x2a1a10, { roughness: 0.2, rim: 0 });
  const handMat = o.gloves ? toonMaterial(0xecece6, { roughness: 0.7 }) : skin;

  const root = new THREE.Group();
  const body = bone(root);
  const pelvis = bone(body, 0, 0.98, 0);
  const spine = bone(pelvis, 0, 0.06, 0);
  const chest = bone(spine, 0, 0.2, 0);
  const neck = bone(chest, 0, 0.39, 0);
  const head = bone(neck, 0, 0.07, 0);

  // Hips and torso.
  P.add(pelvis, sphere(0.2), trousers, { y: 0.0, sx: 0.98, sy: 0.62, sz: 0.74 });
  const torso = new THREE.LatheGeometry(
    [
      [0.001, -0.22],
      [0.15, -0.22],
      [0.152, -0.08],
      [0.168, 0.06],
      [0.19, 0.2],
      [0.196, 0.3],
      [0.168, 0.37],
      [0.08, 0.41],
      [0.001, 0.415],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    32,
  );
  P.add(chest, torso, shirtMat, { sx: 1.12, sz: 0.78 });
  P.add(chest, new THREE.TorusGeometry(0.075, 0.02, 8, 24), accent, { y: 0.4, rx: Math.PI / 2, sx: 1.1, sy: 0.9 });
  P.add(neck, new THREE.CylinderGeometry(0.052, 0.058, 0.1, 14), skin, { y: 0.03 });

  // Head: skull, jaw, nose, ears, eyes, brows.
  P.add(head, sphere(0.125, 24, 18), skin, { y: 0.13, sx: 0.92, sy: 1.04 });
  P.add(head, sphere(0.1), skin, { y: 0.065, z: 0.02, sx: 0.95, sy: 0.8, sz: 0.95 });
  P.add(head, sphere(0.024, 12, 8), skin, { y: 0.12, z: 0.118, sx: 0.9, sy: 1.1, sz: 1.2 });
  for (const s of [1, -1]) {
    P.add(head, sphere(0.032, 12, 8), skin, { x: s * 0.113, y: 0.12, sx: 0.45, sz: 0.8 });
    P.add(head, sphere(0.022, 14, 10), eyeWhite, { x: s * 0.042, y: 0.148, z: 0.102, sy: 1.1, sz: 0.5 });
    P.add(head, sphere(0.012, 10, 8), iris, { x: s * 0.042, y: 0.148, z: 0.113, sz: 0.5 });
    P.add(head, capsule(0.007, 0.03, 3, 6), hair, { x: s * 0.044, y: 0.178, z: 0.108, rz: Math.PI / 2 + s * 0.15 });
  }
  if (o.beard !== false) P.add(head, sphere(0.1), hair, { y: 0.07, z: 0.03, sx: 1.03, sy: 0.72, sz: 0.94 });

  const hw = o.headwear ?? 'cap';
  const capColor = o.capColor ?? 0x1b2a5a;
  if (hw === 'cap') {
    const cap = toonMaterial(capColor, { roughness: 0.75 });
    P.add(head, new THREE.SphereGeometry(0.133, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cap, { y: 0.15, sx: 0.95 });
    P.add(head, new THREE.CylinderGeometry(0.13, 0.13, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), cap, {
      y: 0.165,
      z: 0.07,
      sz: 1.25,
      rx: 0.12,
    });
  } else if (hw === 'helmet') {
    const shell = toonMaterial(capColor, { roughness: 0.3, rim: 0.5 });
    const steel = toonMaterial(0xc2c8ce, { roughness: 0.3, metalness: 0.7, rim: 0.2 });
    P.add(head, new THREE.SphereGeometry(0.148, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), shell, { y: 0.13, z: -0.005, sx: 0.98, sz: 1.06 });
    P.add(head, new THREE.CylinderGeometry(0.15, 0.15, 0.014, 24, 1, false, -Math.PI / 2, Math.PI), shell, {
      y: 0.165,
      z: 0.035,
      sz: 1.25,
      rx: 0.18,
    });
    for (let i = 0; i < 3; i++) {
      P.add(head, new THREE.TorusGeometry(0.142, 0.0065, 6, 24, Math.PI), steel, { y: 0.115 - i * 0.042, z: 0.005, rx: Math.PI / 2 });
    }
    for (const s of [-1, 0, 1]) P.add(head, capsule(0.006, 0.085, 2, 6), steel, { x: s * 0.05, y: 0.075, z: 0.138 - Math.abs(s) * 0.015 });
    P.add(head, new THREE.BoxGeometry(0.16, 0.07, 0.02), shell, { y: 0.05, z: -0.13, rx: -0.2 });
    // A small badge on the front.
    P.add(head, new THREE.CircleGeometry(0.02, 12), toonMaterial(0xd23b3b), { y: 0.22, z: 0.132, rx: -0.5 });
  } else if (hw === 'hat') {
    const hat = toonMaterial(capColor, { roughness: 0.85 });
    P.add(head, new THREE.CylinderGeometry(0.3, 0.3, 0.018, 28), hat, { y: 0.24 });
    P.add(head, new THREE.CylinderGeometry(0.13, 0.15, 0.13, 22), hat, { y: 0.3 });
  } else {
    P.add(head, new THREE.SphereGeometry(0.132, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), hair, { y: 0.145 });
  }

  // Arms.
  const makeArm = (side) => {
    const shoulder = bone(chest, side * 0.2, 0.3, 0);
    P.add(shoulder, sphere(0.066), sleeve, { sx: 1.05 });
    P.add(shoulder, capsule(0.054, 0.2), sleeve, { y: -0.14 });
    const elbow = bone(shoulder, 0, -LIMBS.upper, 0);
    const forearmMat = o.shortSleeves ? skin : sleeve;
    P.add(elbow, capsule(0.046, 0.17), forearmMat, { y: -0.12 });
    if (!o.shortSleeves) P.add(elbow, capsule(0.045, 0.02), skin, { y: -0.225 });
    const wrist = bone(elbow, 0, -LIMBS.lower, 0);
    P.add(wrist, sphere(0.05), handMat, { y: -0.045, sx: 0.9, sy: 1.15, sz: 0.65 });
    P.add(wrist, sphere(0.043), handMat, { y: -0.095, z: 0.012, sx: 0.88, sy: 0.9, sz: 0.72 });
    P.add(wrist, capsule(0.018, 0.035), handMat, { x: side * 0.034, y: -0.05, z: 0.03, rz: side * 0.6, rx: 0.4 });
    if (o.gloves) P.add(wrist, new THREE.CylinderGeometry(0.052, 0.056, 0.05, 14), accent, { y: 0.01 });
    return { shoulder, elbow, wrist };
  };
  const makeLeg = (side) => {
    const hip = bone(pelvis, side * 0.1, -0.03, 0);
    P.add(hip, capsule(0.082, 0.28), trousers, { y: -0.21 });
    const knee = bone(hip, 0, -0.44, 0);
    P.add(knee, capsule(0.062, 0.3), trousers, { y: -0.2 });
    if (o.pads) {
      const pad = toonMaterial(0xefefe8, { roughness: 0.6 });
      const strap = toonMaterial(0xc9ccd2, { roughness: 0.6 });
      for (const px of [-0.036, 0, 0.036]) P.add(knee, capsule(0.03, 0.34), pad, { x: px, y: -0.18, z: 0.058 });
      P.add(knee, sphere(0.07), pad, { y: 0.02, z: 0.06, sx: 1.2, sy: 0.8, sz: 0.7 });
      for (const py of [-0.08, -0.26]) P.add(knee, new THREE.BoxGeometry(0.14, 0.02, 0.1), strap, { y: py, z: 0.03 });
    }
    const ankle = bone(knee, 0, -0.43, 0);
    P.add(ankle, sphere(0.06), shoe, { y: -0.045, z: 0.045, sx: 0.9, sy: 0.7, sz: 2.05 });
    P.add(ankle, new THREE.BoxGeometry(0.1, 0.022, 0.24), toonMaterial(0xe6e6e2, { roughness: 0.6 }), { y: -0.085, z: 0.045 });
    for (const sz of [-0.06, 0.02, 0.1]) {
      for (const sx of [-0.028, 0.028]) P.add(ankle, new THREE.CylinderGeometry(0.008, 0.004, 0.018, 6), spikes, { x: sx, y: -0.1, z: sz + 0.03 });
    }
    return { hip, knee, ankle };
  };

  const c = {
    root,
    body,
    pelvis,
    spine,
    chest,
    neck,
    head,
    armL: makeArm(1),
    armR: makeArm(-1),
    legL: makeLeg(1),
    legR: makeLeg(-1),
    scale: o.scale ?? 0.92,
  };
  P.build();
  root.scale.setScalar(c.scale);
  resetPose(c);
  return c;
}

// ---------------------------------------------------------------------------
// Posing. Rotations are Euler XYZ. For arms and legs, rotation.x < 0 swings
// the limb forward (+Z); elbows and knees flex with x < 0 and x > 0.

const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head'];

export function resetPose(c) {
  c.body.position.set(0, 0, 0);
  c.body.rotation.set(0, 0, 0);
  for (const j of JOINTS) c[j].rotation.set(0, 0, 0);
  for (const a of [c.armL, c.armR]) {
    a.shoulder.rotation.set(0, 0, 0);
    a.shoulder.quaternion.identity();
    a.elbow.rotation.set(0, 0, 0);
    a.wrist.rotation.set(0, 0, 0);
  }
  c.armL.shoulder.rotation.z = 0.1;
  c.armR.shoulder.rotation.z = -0.1;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.set(0, 0, 0);
    l.knee.rotation.set(0, 0, 0);
    l.ankle.rotation.set(0, 0, 0);
  }
}

export function poseIdle(c, t, phase = 0) {
  resetPose(c);
  c.body.position.y = Math.sin(t * 2 + phase) * 0.008;
  c.chest.rotation.x = Math.sin(t * 1.3 + phase) * 0.02;
  c.head.rotation.y = Math.sin(t * 0.4 + phase) * 0.15;
  c.armL.elbow.rotation.x = -0.18;
  c.armR.elbow.rotation.x = -0.18;
}

export function poseRun(c, phase, k = 1) {
  resetPose(c);
  const s = Math.sin(phase);
  c.body.position.y = Math.abs(Math.cos(phase)) * 0.06 * k - 0.02 * k;
  c.spine.rotation.x = 0.16 * k;
  c.legL.hip.rotation.x = -s * 0.85 * k;
  c.legR.hip.rotation.x = s * 0.85 * k;
  c.legL.knee.rotation.x = Math.max(0, Math.sin(phase + 1.3)) * 1.35 * k;
  c.legR.knee.rotation.x = Math.max(0, Math.sin(phase + 1.3 + Math.PI)) * 1.35 * k;
  c.legL.ankle.rotation.x = -0.2 * k;
  c.legR.ankle.rotation.x = -0.2 * k;
  c.armL.shoulder.rotation.x = s * 0.8 * k;
  c.armR.shoulder.rotation.x = -s * 0.8 * k;
  c.armL.elbow.rotation.x = -1.2 * k;
  c.armR.elbow.rotation.x = -1.2 * k;
}

/** Fielder walking in, crouched and ready. */
export function poseReady(c, t = 0, phase = 0) {
  resetPose(c);
  const b = Math.sin(t * 3 + phase) * 0.008;
  c.body.position.y = -0.1 + b;
  c.spine.rotation.x = 0.32;
  c.head.rotation.x = -0.28;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.x = -0.42;
    l.knee.rotation.x = 0.75;
    l.ankle.rotation.x = -0.3;
  }
  c.legL.hip.rotation.z = 0.14;
  c.legR.hip.rotation.z = -0.14;
  c.armL.shoulder.rotation.x = -0.55;
  c.armR.shoulder.rotation.x = -0.55;
  c.armL.elbow.rotation.x = -0.55;
  c.armR.elbow.rotation.x = -0.55;
}

/** Wicket-keeper squat. */
export function poseSquat(c, t = 0) {
  resetPose(c);
  c.body.position.y = -0.4 + Math.sin(t * 2.4) * 0.006;
  c.spine.rotation.x = 0.35;
  c.head.rotation.x = -0.4;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.x = -1.25;
    l.knee.rotation.x = 1.95;
    l.ankle.rotation.x = -0.65;
  }
  c.legL.hip.rotation.z = 0.35;
  c.legR.hip.rotation.z = -0.35;
  c.armL.shoulder.rotation.x = -0.95;
  c.armR.shoulder.rotation.x = -0.95;
  c.armL.elbow.rotation.x = -0.3;
  c.armR.elbow.rotation.x = -0.3;
}

/**
 * Right-arm bowling action, u in [0, 1]: gather and bound, the arm
 * windmills over (release at RELEASE_U), then the follow-through.
 */
export const RELEASE_U = 0.56;
export function poseBowl(c, u) {
  resetPose(c);
  const ease = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const gather = ease(0, 0.35, u);
  const whirl = ease(0.3, 0.8, u);
  const follow = ease(0.72, 1, u);
  c.body.position.y = Math.sin(gather * Math.PI) * 0.2 - follow * 0.12;
  c.pelvis.rotation.y = (1 - whirl) * 0.9 - follow * 0.35;
  c.spine.rotation.x = -0.15 * gather + whirl * 0.5 + follow * 0.3;
  c.chest.rotation.y = (1 - whirl) * 0.4;
  c.armL.shoulder.rotation.x = -gather * 2.8 + whirl * 3.4;
  c.armL.elbow.rotation.x = -0.2;
  c.armR.shoulder.rotation.x = 0.4 + whirl * (Math.PI * 2 - 0.2) + follow * 0.2;
  c.armR.shoulder.rotation.z = -0.05;
  c.legL.hip.rotation.x = -0.6 * gather + whirl * 0.4;
  c.legL.knee.rotation.x = 0.9 * gather * (1 - whirl) + 0.1;
  c.legR.hip.rotation.x = 0.5 * gather - follow * 0.9;
  c.legR.knee.rotation.x = 0.5 + follow * 0.4;
}

export function poseCelebrate(c, t) {
  resetPose(c);
  c.body.position.y = Math.abs(Math.sin(t * 7)) * 0.16;
  c.armL.shoulder.rotation.x = -(Math.PI - 0.25);
  c.armR.shoulder.rotation.x = -(Math.PI - 0.25);
  c.armL.shoulder.rotation.z = 0.35;
  c.armR.shoulder.rotation.z = -0.35;
  c.head.rotation.x = -0.25;
}

/** Hands cupped up for a catch. */
export function poseCatch(c) {
  resetPose(c);
  c.body.position.y = -0.05;
  c.spine.rotation.x = -0.1;
  c.head.rotation.x = -0.4;
  c.armL.shoulder.rotation.x = -2.3;
  c.armR.shoulder.rotation.x = -2.3;
  c.armL.shoulder.rotation.z = -0.25;
  c.armR.shoulder.rotation.z = 0.25;
  c.armL.elbow.rotation.x = -0.4;
  c.armR.elbow.rotation.x = -0.4;
}

/** Umpire signals: 'out' (finger up), 'four' (arm waves), 'six' (both up). */
export function poseUmpire(c, signal, t) {
  poseIdle(c, t, 1.3);
  c.head.rotation.y = 0;
  if (signal === 'out') {
    c.armR.shoulder.rotation.x = -(Math.PI - 0.2);
    c.armR.elbow.rotation.x = 0;
  } else if (signal === 'six') {
    c.armL.shoulder.rotation.x = -Math.PI;
    c.armR.shoulder.rotation.x = -Math.PI;
    c.armL.elbow.rotation.x = 0;
    c.armR.elbow.rotation.x = 0;
  } else if (signal === 'four') {
    c.armR.shoulder.rotation.z = -Math.PI / 2;
    c.armR.shoulder.rotation.x = Math.sin(t * 9) * 0.6;
    c.armR.elbow.rotation.x = 0;
  }
}

// ---------------------------------------------------------------------------
// Two-bone arm IK: puts the hand (wrist) at a world-space target, with the
// elbow bending towards a pole point.

const _v = {
  s: new THREE.Vector3(),
  t: new THREE.Vector3(),
  p: new THREE.Vector3(),
  up: new THREE.Vector3(),
  f: new THREE.Vector3(),
  x: new THREE.Vector3(),
  y: new THREE.Vector3(),
  z: new THREE.Vector3(),
  m: new THREE.Matrix4(),
  inv: new THREE.Matrix4(),
};

export function solveArm(c, arm, targetWorld, poleWorld) {
  const { shoulder, elbow } = arm;
  const parent = shoulder.parent;
  parent.updateWorldMatrix(true, false);
  _v.inv.copy(parent.matrixWorld).invert();
  // Everything in the chest's (the shoulder's parent) space.
  const t = _v.t.copy(targetWorld).applyMatrix4(_v.inv).sub(shoulder.position);
  const p = _v.p.copy(poleWorld).applyMatrix4(_v.inv).sub(shoulder.position);
  const a = LIMBS.upper;
  const b = LIMBS.lower;
  const d = THREE.MathUtils.clamp(t.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  const dir = t.clone().normalize();
  const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // Pole direction, perpendicular to the shoulder→hand line.
  const pn = p.clone().sub(dir.clone().multiplyScalar(p.dot(dir)));
  if (pn.lengthSq() < 1e-6) pn.set(0, 0, 1).sub(dir.clone().multiplyScalar(dir.z));
  pn.normalize();
  const up = _v.up.copy(dir).multiplyScalar(cosA).addScaledVector(pn, sinA); // upper arm direction
  const elbowPos = up.clone().multiplyScalar(a);
  const fore = _v.f.copy(dir).multiplyScalar(d).sub(elbowPos).normalize();
  const interior = Math.acos(THREE.MathUtils.clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const flex = Math.PI - interior;
  // Shoulder frame: local -Y along the upper arm, the forearm bends to +Z.
  const Y = _v.y.copy(up).negate();
  const Z = _v.z.copy(fore).addScaledVector(Y, fore.dot(up)); // component of fore ⟂ to the arm
  if (Z.lengthSq() < 1e-6) Z.copy(pn);
  Z.normalize();
  const X = _v.x.crossVectors(Y, Z).normalize();
  _v.m.makeBasis(X, Y, Z);
  shoulder.quaternion.setFromRotationMatrix(_v.m);
  elbow.rotation.set(-flex, 0, 0);
}
