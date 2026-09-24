import * as THREE from 'three';
import { addRim } from './characters.js';
import { batFaceCanvas, gripCanvas, toTexture } from './textures.js';

// A cricket bat: shaped willow blade (flat face, bowed back with a spine,
// sloping shoulders, rounded toe) and a rubber-gripped handle.
// Local frame: y = 0 is the top of the blade, the handle goes up (+y) to
// y = HANDLE, the blade goes down to y = -BLADE, the face points +z.

export const BLADE = 0.56;
export const HANDLE = 0.3;
const WIDTH = 0.108;

function bladeGeometry() {
  const rings = 30;
  const around = 32;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j <= rings; j++) {
    const v = j / rings; // 0 = toe, 1 = shoulder
    const y = -BLADE + v * BLADE;
    // Width: rounded toe, full blade, then shoulders sloping into the handle.
    const toe = Math.sqrt(Math.min(1, v / 0.05));
    const shoulder = v > 0.9 ? 1 - ((v - 0.9) / 0.1) ** 1.6 * 0.62 : 1;
    const hw = (WIDTH / 2) * Math.min(toe * 0.15 + 0.85, 1) * shoulder;
    // Back thickness: the spine is thickest a third of the way up.
    const spine = 0.024 + 0.03 * Math.exp(-(((v - 0.33) / 0.28) ** 2));
    for (let i = 0; i <= around; i++) {
      const th = (i / around) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const x = hw * Math.sign(c) * Math.abs(c) ** 0.4;
      const z = s >= 0 ? 0.013 * Math.abs(s) ** 0.25 : -(0.012 + spine * Math.abs(s) ** 0.9);
      pos.push(x, y, z);
      // The back is mirrored so its sticker reads correctly from behind.
      uv.push(s >= 0 ? x / WIDTH + 0.5 : 0.5 - x / WIDTH, v);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i;
      const b = a + around + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Toe cap.
  const center = pos.length / 3;
  pos.push(0, -BLADE, -0.01);
  uv.push(0.5, 0);
  for (let i = 0; i < around; i++) idx.push(center, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let shared = null;

export function createBat(assets = {}) {
  if (!shared) {
    const face = toTexture(batFaceCanvas(assets.batSticker));
    const grip = toTexture(gripCanvas(), { repeat: [1, 3] });
    shared = {
      blade: bladeGeometry(),
      handle: new THREE.CylinderGeometry(0.0165, 0.018, HANDLE, 16, 1),
      cap: new THREE.SphereGeometry(0.0175, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      willow: addRim(new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 }), 0.25),
      grip: addRim(new THREE.MeshStandardMaterial({ map: grip, roughness: 0.85 }), 0.2),
    };
    shared.handle.translate(0, HANDLE / 2, 0);
    shared.cap.translate(0, HANDLE, 0);
  }
  const bat = new THREE.Group();
  const blade = new THREE.Mesh(shared.blade, shared.willow);
  const handle = new THREE.Mesh(shared.handle, shared.grip);
  const cap = new THREE.Mesh(shared.cap, shared.grip);
  for (const m of [blade, handle, cap]) {
    m.castShadow = true;
    bat.add(m);
  }
  return bat;
}

/**
 * Orients a bat from the direction its blade points (handle → toe) and the
 * direction its face looks, with the top of the handle at `top`.
 */
export function aimBat(bat, top, dir, face) {
  const y = dir.clone().normalize().negate();
  const z = face.clone().addScaledVector(y, -face.dot(y));
  if (z.lengthSq() < 1e-6) z.set(1, 0, 0).addScaledVector(y, -y.x);
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  bat.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  bat.position.copy(top).addScaledVector(y, -HANDLE);
}
