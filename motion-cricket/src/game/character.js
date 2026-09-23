import * as THREE from 'three';

// Stylized, chunky characters (big head, soft shapes) to match the reference
// art. Local space: the character faces +Z, its left side is +X.

const geoCache = new Map();
function capsule(r, len) {
  const key = `c${r}_${len}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.CapsuleGeometry(r, len, 6, 12));
  return geoCache.get(key);
}
function sphere(r) {
  const key = `s${r}`;
  if (!geoCache.has(key)) geoCache.set(key, new THREE.SphereGeometry(r, 20, 14));
  return geoCache.get(key);
}

const matCache = new Map();
function mat(color, roughness = 0.72) {
  const key = `${color}_${roughness}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return matCache.get(key);
}

function mesh(geo, material, { x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(rx, 0, rz);
  m.castShadow = true;
  return m;
}

function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

/**
 * @param {object} o
 * @param {'cap'|'helmet'|'hat'|'none'} o.headwear
 */
export function createCharacter(o = {}) {
  const shirt = mat(o.shirt ?? 0xf7f4ec);
  const trousers = mat(o.trousers ?? 0xefebe1);
  const skin = mat(o.skin ?? 0xb97a4f, 0.6);
  const hair = mat(o.hair ?? 0x1c1410, 0.9);
  const shoes = mat(o.shoes ?? 0xfafafa, 0.5);
  const accent = mat(o.accent ?? 0x0d6b73, 0.6);

  const root = new THREE.Group();
  const body = group(root); // bob / lean
  const hips = group(body, 0, 1.0, 0);
  hips.add(mesh(sphere(0.2), trousers, { y: 0.02, sx: 1.05, sy: 0.7, sz: 0.8 }));

  const spine = group(hips, 0, 0.06, 0);
  spine.add(mesh(capsule(0.2, 0.28), shirt, { y: 0.3, sx: 1.08, sz: 0.78 }));
  // Collar trim in team colour.
  spine.add(mesh(new THREE.TorusGeometry(0.1, 0.022, 8, 20), accent, { y: 0.56, rx: Math.PI / 2, sz: 0.8 }));

  const neck = group(spine, 0, 0.56, 0);
  neck.add(mesh(capsule(0.06, 0.05), skin, { y: 0.03 }));
  const head = group(neck, 0, 0.1, 0);
  head.add(mesh(sphere(0.17), skin, { y: 0.13, sx: 0.95, sz: 1.0 }));
  head.add(mesh(sphere(0.035), skin, { y: 0.12, z: 0.165 })); // nose
  head.add(mesh(sphere(0.04), skin, { x: 0.165, y: 0.12, sx: 0.5 })); // ears
  head.add(mesh(sphere(0.04), skin, { x: -0.165, y: 0.12, sx: 0.5 }));
  // Eyes give the stylized look some life.
  const eyeW = mat(0xffffff, 0.3);
  const eyeB = mat(0x201810, 0.3);
  for (const ex of [0.06, -0.06]) {
    head.add(mesh(sphere(0.03), eyeW, { x: ex, y: 0.17, z: 0.145, sz: 0.5 }));
    head.add(mesh(sphere(0.016), eyeB, { x: ex, y: 0.17, z: 0.162, sz: 0.5 }));
  }
  head.add(mesh(sphere(0.07), hair, { y: 0.06, z: 0.1, sx: 1.4, sy: 0.55, sz: 0.7 })); // beard

  const hw = o.headwear ?? 'cap';
  if (hw === 'cap') {
    const cap = mat(o.capColor ?? 0x1b2a5a, 0.7);
    head.add(mesh(new THREE.SphereGeometry(0.178, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap, { y: 0.16 }));
    head.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), cap, { y: 0.17, z: 0.12, sz: 1.2 }));
  } else if (hw === 'helmet') {
    const shell = mat(o.capColor ?? 0x1b2a5a, 0.35);
    head.add(mesh(new THREE.SphereGeometry(0.2, 22, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), shell, { y: 0.14 }));
    const grille = mat(0xb9c0c8, 0.3);
    for (let i = 0; i < 3; i++) {
      head.add(mesh(new THREE.TorusGeometry(0.19, 0.008, 6, 20, Math.PI), grille, { y: 0.1 - i * 0.045, rx: Math.PI / 2, rz: 0, sy: 1 }));
    }
  } else if (hw === 'hat') {
    const hat = mat(o.capColor ?? 0xf5f1e6, 0.8);
    head.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.02, 28), hat, { y: 0.24 }));
    head.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 22), hat, { y: 0.3 }));
  } else {
    head.add(mesh(new THREE.SphereGeometry(0.178, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, { y: 0.15 }));
  }

  const makeArm = (side) => {
    const shoulder = group(spine, side * 0.26, 0.48, 0);
    shoulder.add(mesh(sphere(0.085), shirt, { sx: 1.1 }));
    shoulder.add(mesh(capsule(0.068, 0.2), shirt, { y: -0.15 }));
    const elbow = group(shoulder, 0, -0.3, 0);
    elbow.add(mesh(capsule(0.058, 0.18), o.shortSleeves ? skin : shirt, { y: -0.12 }));
    const hand = group(elbow, 0, -0.27, 0);
    hand.add(mesh(sphere(0.062), o.gloves ? mat(0xf4f4f4, 0.6) : skin, { sy: 1.15 }));
    return { shoulder, elbow, hand };
  };
  const makeLeg = (side) => {
    const hip = group(hips, side * 0.1, -0.02, 0);
    hip.add(mesh(capsule(0.092, 0.3), trousers, { y: -0.22 }));
    const knee = group(hip, 0, -0.47, 0);
    knee.add(mesh(capsule(0.078, 0.3), trousers, { y: -0.21 }));
    if (o.pads) {
      const pad = mat(0xfbfbf8, 0.55);
      knee.add(mesh(new THREE.BoxGeometry(0.2, 0.52, 0.12), pad, { y: -0.2, z: 0.07 }));
    }
    const foot = group(knee, 0, -0.45, 0);
    foot.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.26), shoes, { y: -0.03, z: 0.05 }));
    return { hip, knee, foot };
  };

  const c = {
    root,
    body,
    hips,
    spine,
    neck,
    head,
    armL: makeArm(1),
    armR: makeArm(-1),
    legL: makeLeg(1),
    legR: makeLeg(-1),
  };
  root.scale.setScalar(o.scale ?? 0.93);
  resetPose(c);
  return c;
}

export function resetPose(c) {
  c.body.position.set(0, 0, 0);
  c.body.rotation.set(0, 0, 0);
  for (const g of [c.hips, c.spine, c.neck, c.head]) g.rotation.set(0, 0, 0);
  for (const a of [c.armL, c.armR]) {
    a.shoulder.rotation.set(0, 0, 0);
    a.elbow.rotation.set(0, 0, 0);
  }
  c.armL.shoulder.rotation.z = 0.12;
  c.armR.shoulder.rotation.z = -0.12;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.set(0, 0, 0);
    l.knee.rotation.set(0, 0, 0);
    l.foot.rotation.set(0, 0, 0);
  }
}

// Rotation.x < 0 swings a limb forward (towards +Z).

export function poseIdle(c, t) {
  resetPose(c);
  const b = Math.sin(t * 2.2) * 0.012;
  c.body.position.y = b;
  c.armL.elbow.rotation.x = -0.15;
  c.armR.elbow.rotation.x = -0.15;
}

export function poseRun(c, phase, intensity = 1) {
  resetPose(c);
  const s = Math.sin(phase);
  const k = intensity;
  c.body.position.y = Math.abs(Math.cos(phase)) * 0.06 * k;
  c.spine.rotation.x = 0.18 * k;
  c.legL.hip.rotation.x = -s * 0.85 * k;
  c.legR.hip.rotation.x = s * 0.85 * k;
  c.legL.knee.rotation.x = Math.max(0, Math.sin(phase + 1.3)) * 1.3 * k;
  c.legR.knee.rotation.x = Math.max(0, Math.sin(phase + 1.3 + Math.PI)) * 1.3 * k;
  c.armL.shoulder.rotation.x = s * 0.8 * k;
  c.armR.shoulder.rotation.x = -s * 0.8 * k;
  c.armL.elbow.rotation.x = -1.1 * k;
  c.armR.elbow.rotation.x = -1.1 * k;
}

/** Fielder's "walk-in" ready crouch. */
export function poseReady(c, t = 0) {
  resetPose(c);
  c.body.position.y = -0.12 + Math.sin(t * 3) * 0.008;
  c.spine.rotation.x = 0.35;
  c.head.rotation.x = -0.3;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.x = -0.45;
    l.knee.rotation.x = 0.8;
    l.foot.rotation.x = -0.3;
  }
  c.legL.hip.rotation.z = 0.12;
  c.legR.hip.rotation.z = -0.12;
  c.armL.shoulder.rotation.x = -0.6;
  c.armR.shoulder.rotation.x = -0.6;
  c.armL.elbow.rotation.x = -0.5;
  c.armR.elbow.rotation.x = -0.5;
}

/** Wicket-keeper squat. */
export function poseSquat(c) {
  resetPose(c);
  c.body.position.y = -0.42;
  c.spine.rotation.x = 0.3;
  c.head.rotation.x = -0.35;
  for (const l of [c.legL, c.legR]) {
    l.hip.rotation.x = -1.3;
    l.knee.rotation.x = 2.0;
    l.foot.rotation.x = -0.7;
  }
  c.legL.hip.rotation.z = 0.35;
  c.legR.hip.rotation.z = -0.35;
  c.armL.shoulder.rotation.x = -0.9;
  c.armR.shoulder.rotation.x = -0.9;
}

/**
 * Bowling action for a right-arm bowler, u in [0, 1]:
 * 0-0.35 gather and bound, 0.3-0.8 arm windmill (release ~0.56),
 * 0.75-1 follow-through.
 */
export function poseBowl(c, u) {
  resetPose(c);
  const ease = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const gather = ease(0, 0.35, u);
  const whirl = ease(0.3, 0.8, u);
  const follow = ease(0.72, 1, u);
  // Bound: up then down.
  c.body.position.y = Math.sin(gather * Math.PI) * 0.22 - follow * 0.12;
  // Side-on, then the chest turns to face the batter.
  c.hips.rotation.y = (1 - whirl) * 0.9 - follow * 0.3;
  c.spine.rotation.x = -0.15 * gather + whirl * 0.55 + follow * 0.25;
  c.spine.rotation.y = (1 - whirl) * 0.4;
  // Front (left) arm reaches up, then pulls down.
  c.armL.shoulder.rotation.x = -gather * 2.8 + whirl * 3.4;
  c.armL.elbow.rotation.x = -0.2;
  // Bowling (right) arm: from low behind, over the top, down past the left hip.
  c.armR.shoulder.rotation.x = 0.4 + whirl * (Math.PI * 2 - 0.2) + follow * 0.2;
  c.armR.shoulder.rotation.z = -0.05;
  // Front leg braces, back leg drags through.
  c.legL.hip.rotation.x = -0.6 * gather + whirl * 0.4;
  c.legL.knee.rotation.x = 0.9 * gather * (1 - whirl) + 0.1;
  c.legR.hip.rotation.x = 0.5 * gather - follow * 0.9;
  c.legR.knee.rotation.x = 0.5 + follow * 0.4;
}

export function poseCelebrate(c, t) {
  resetPose(c);
  c.body.position.y = Math.abs(Math.sin(t * 7)) * 0.18;
  c.armL.shoulder.rotation.x = Math.PI - 0.2;
  c.armR.shoulder.rotation.x = Math.PI - 0.2;
  c.armL.shoulder.rotation.z = 0.35;
  c.armR.shoulder.rotation.z = -0.35;
}

/** Umpire signals: 'out' (finger up), 'four' (arm waves), 'six' (both up). */
export function poseUmpire(c, signal, t) {
  resetPose(c);
  c.armL.elbow.rotation.x = -0.3;
  c.armR.elbow.rotation.x = -0.3;
  if (signal === 'out') {
    c.armR.shoulder.rotation.x = -(Math.PI - 0.25);
    c.armR.elbow.rotation.x = 0;
  } else if (signal === 'six') {
    c.armL.shoulder.rotation.x = Math.PI;
    c.armR.shoulder.rotation.x = Math.PI;
    c.armL.elbow.rotation.x = 0;
    c.armR.elbow.rotation.x = 0;
  } else if (signal === 'four') {
    c.armR.shoulder.rotation.z = -Math.PI / 2;
    c.armR.shoulder.rotation.x = Math.sin(t * 9) * 0.6;
    c.armR.elbow.rotation.x = 0;
  }
}
