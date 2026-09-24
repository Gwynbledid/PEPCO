import * as THREE from 'three';
import { aimBat, createBat } from './batModel.js';
import { createCharacter, resetPose, solveArm } from './characters.js';
import { jerseyCanvas, toTexture } from './textures.js';

// The player's own batter, seen in the menu and in six replays: helmet,
// pads, gloves, name and number on the back. Poses set the body and the
// bat; two-bone IK then puts both hands on the handle.
//
// Pose space is the character's (facing +z, its left +x). A right-hander
// stands side-on with the left shoulder to the bowler.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Joint rotations [x, y, z] and the bat: where the top of the handle is, the
// direction the blade points, and where its face looks.
const POSES = {
  stance: {
    body: -0.07,
    spine: [0.2, 0, 0],
    chest: [0.05, 0.2, 0],
    neck: [0, 0.35, 0],
    head: [-0.1, 0.95, 0],
    hipL: [-0.12, 0, 0.16],
    kneeL: [0.3, 0, 0],
    ankleL: [-0.16, 0, 0],
    hipR: [0.05, 0, -0.14],
    kneeR: [0.28, 0, 0],
    ankleR: [-0.14, 0, 0],
    bat: { top: V(0.06, 1.0, 0.3), dir: V(-0.12, -1, 0.02), face: V(1, 0, 0.25) },
  },
  // The reference image: bat lifted high behind, eyes on the ball.
  backlift: {
    body: -0.09,
    spine: [0.24, 0, 0],
    chest: [0.05, 0.1, 0.05],
    neck: [0, 0.4, 0],
    head: [0.05, 0.95, 0],
    hipL: [-0.18, 0, 0.18],
    kneeL: [0.34, 0, 0],
    ankleL: [-0.14, 0, 0],
    hipR: [0.06, 0, -0.16],
    kneeR: [0.3, 0, 0],
    ankleR: [-0.12, 0, 0],
    bat: { top: V(-0.12, 1.18, 0.16), dir: V(-0.72, 0.62, -0.28), face: V(0.15, 0.25, 1) },
  },
  // Big lofted follow-through: bat wrapped over the shoulder, chest to the bowler.
  followHigh: {
    body: -0.02,
    pelvis: [0, 0.55, 0],
    spine: [0.02, 0.2, 0],
    chest: [-0.12, 0.5, 0],
    neck: [0, 0.05, 0],
    head: [-0.3, 0.25, 0],
    hipL: [-0.28, 0, 0.12],
    kneeL: [0.12, 0, 0],
    ankleL: [0, 0, 0],
    hipR: [0.3, 0, -0.1],
    kneeR: [0.55, 0, 0],
    ankleR: [0.4, 0, 0],
    bat: { top: V(0.28, 1.62, 0.05), dir: V(-0.55, 0.35, -0.76), face: V(0.2, 0.9, 0.3) },
  },
  // Ground drive: bat follows through high in front, pointing where the ball went.
  followLow: {
    body: -0.1,
    pelvis: [0, 0.35, 0],
    spine: [0.28, 0.1, 0],
    chest: [0.05, 0.35, 0],
    neck: [0, 0.2, 0],
    head: [0.1, 0.55, 0],
    hipL: [-0.5, 0, 0.12],
    kneeL: [0.5, 0, 0],
    ankleL: [-0.2, 0, 0],
    hipR: [0.3, 0, -0.1],
    kneeR: [0.45, 0, 0],
    ankleR: [0.3, 0, 0],
    bat: { top: V(0.35, 1.32, 0.42), dir: V(-0.35, 0.8, -0.3), face: V(0.9, -0.1, 0.4) },
  },
};

const JOINT_KEYS = ['pelvis', 'spine', 'chest', 'neck', 'head'];
const LIMB_KEYS = {
  hipL: ['legL', 'hip'],
  kneeL: ['legL', 'knee'],
  ankleL: ['legL', 'ankle'],
  hipR: ['legR', 'hip'],
  kneeR: ['legR', 'knee'],
  ankleR: ['legR', 'ankle'],
};

function lerpPose(a, b, t) {
  const out = { bat: {} };
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === 'bat') continue;
    const va = a[k] ?? (k === 'body' ? 0 : [0, 0, 0]);
    const vb = b[k] ?? (k === 'body' ? 0 : [0, 0, 0]);
    out[k] = typeof va === 'number' ? va + (vb - va) * t : va.map((x, i) => x + (vb[i] - x) * t);
  }
  for (const k of ['top', 'dir', 'face']) out.bat[k] = a.bat[k].clone().lerp(b.bat[k], t);
  return out;
}

export class Batter {
  constructor(scene, { name = 'YOU', number = '18', assets = {} } = {}) {
    this.jersey = toTexture(jerseyCanvas(name, number));
    this.c = createCharacter({
      headwear: 'helmet',
      capColor: 0x1b2a5a,
      pads: true,
      gloves: true,
      jersey: this.jersey,
      accent: 0x0b6e61,
      skin: 0xb07650,
      scale: 0.94,
    });
    this.bat = createBat(assets);
    this.c.root.add(this.bat);
    this.c.root.visible = false;
    scene.add(this.c.root);
    this.hand = 1;
    this.pose = POSES.stance;
    this._w = { top: new THREE.Vector3(), bottom: new THREE.Vector3(), pole: new THREE.Vector3(), s: new THREE.Vector3() };
  }

  setJersey(name, number) {
    const img = jerseyCanvas(name, number);
    this.jersey.image = img;
    this.jersey.needsUpdate = true;
  }

  /** Stands the batter at the crease. hand: 1 right-handed, -1 left-handed. */
  place(position, hand = 1) {
    this.hand = hand;
    this.c.root.position.copy(position);
    // Side-on, facing the off side: +x for a right-hander.
    this.c.root.rotation.y = (hand * Math.PI) / 2;
    // A left-hander is the mirror image (with the shirt lettering flipped back).
    this.c.root.scale.set(this.c.scale * hand, this.c.scale, this.c.scale);
    this.jersey.wrapS = THREE.RepeatWrapping;
    this.jersey.repeat.x = hand;
    this.jersey.offset.x = hand < 0 ? 1 : 0;
    this.jersey.needsUpdate = true;
  }

  show(on) {
    this.c.root.visible = on;
  }

  /** Blend between two named poses (t = 0 → a, 1 → b), with an extra twist towards the shot. */
  setPose(a, b = a, t = 0, twist = 0) {
    const p = lerpPose(POSES[a], POSES[b], t);
    const c = this.c;
    resetPose(c);
    c.body.position.y = p.body;
    for (const k of JOINT_KEYS) if (p[k]) c[k].rotation.set(...p[k]);
    for (const [k, [limb, j]] of Object.entries(LIMB_KEYS)) if (p[k]) c[limb][j].rotation.set(...p[k]);
    c.pelvis.rotation.y += twist * 0.5;
    c.chest.rotation.y += twist * 0.5;
    // Bat in the character's space, turned with the twist.
    const rot = new THREE.Matrix4().makeRotationY(twist);
    aimBat(this.bat, p.bat.top.clone().applyMatrix4(rot), p.bat.dir.clone().applyMatrix4(rot), p.bat.face.clone().applyMatrix4(rot));
    this._gripHands();
  }

  _gripHands() {
    const c = this.c;
    c.root.updateMatrixWorld(true);
    const w = this._w;
    // Top hand (left for a right-hander) near the top of the handle, bottom hand below.
    this.bat.localToWorld(w.top.set(0, 0.24, 0));
    this.bat.localToWorld(w.bottom.set(0, 0.12, 0));
    const hold = (arm, grip, side) => {
      arm.shoulder.getWorldPosition(w.s);
      // The wrist sits a little back from where the palm wraps the handle.
      const target = grip.clone().add(w.s.clone().sub(grip).normalize().multiplyScalar(0.06));
      c.chest.localToWorld(w.pole.set(side * 0.55, -0.35, -0.35));
      solveArm(c, arm, target, w.pole);
    };
    hold(c.armL, w.top, 1);
    hold(c.armR, w.bottom, -1);
  }
}
