import * as THREE from 'three';
import { BLADE, aimBat, createBat } from './batModel.js';
import { addRim, toonMaterial } from './characters.js';

// First-person view of the player's own bat, gloves and sleeves, parented to
// the camera. The bat takes the grip position, angle and tilt from the
// tracked stick, so it moves exactly as the stick does in the camera preview.

const TRAIL = 12;

function gloveModel() {
  const g = new THREE.Group();
  const white = toonMaterial(0xf7f7f3, { roughness: 0.72, rim: 0.35 });
  const seam = toonMaterial(0xcfdbe8, { roughness: 0.7, rim: 0.2 });
  const teal = toonMaterial(0x0b6e61, { roughness: 0.6 });
  const navy = toonMaterial(0x1b2a5a, { roughness: 0.6 });
  const add = (geo, mat, t = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(t.x || 0, t.y || 0, t.z || 0);
    m.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
    m.scale.set(t.sx || 1, t.sy || 1, t.sz || 1);
    g.add(m);
    return m;
  };
  // Padded back of the hand (faces the player, local -z).
  add(new THREE.SphereGeometry(0.05, 20, 14), white, { z: -0.03, sx: 1.05, sy: 1.25, sz: 0.62 });
  add(new THREE.CircleGeometry(0.018, 16), navy, { z: -0.062, y: 0.01, ry: Math.PI });
  // Four sausage-roll fingers wrapped round the handle.
  for (let k = 0; k < 4; k++) {
    const y = 0.034 - k * 0.022;
    add(new THREE.TorusGeometry(0.03, 0.0125, 10, 20, Math.PI * 1.45), white, { y, rx: Math.PI / 2, rz: -Math.PI * 0.2 });
    add(new THREE.TorusGeometry(0.03, 0.004, 6, 20, Math.PI * 1.4), seam, { y: y - 0.011, rx: Math.PI / 2, rz: -Math.PI * 0.2 });
  }
  // Thumb along the handle, and the cuff towards the wrist.
  add(new THREE.CapsuleGeometry(0.014, 0.04, 4, 10), white, { x: 0.035, y: 0.005, z: 0.018, rz: 0.2 });
  add(new THREE.CylinderGeometry(0.046, 0.05, 0.045, 18), teal, { z: -0.062, y: -0.018, rx: Math.PI / 2 + 0.5 });
  g.traverse((m) => {
    if (m.isMesh) m.castShadow = false;
  });
  return g;
}

export class FirstPersonRig {
  constructor(camera, assets) {
    this.camera = camera;
    this.hand = 1;
    this.rig = new THREE.Group();
    camera.add(this.rig);
    this.bat = createBat(assets);
    this.bat.traverse((m) => {
      if (m.isMesh) m.castShadow = false;
    });
    this.rig.add(this.bat);
    this.gloveTop = gloveModel();
    this.gloveBottom = gloveModel();
    this.gloveTop.position.set(0, 0.24, 0);
    this.gloveBottom.position.set(0, 0.125, 0);
    this.bat.add(this.gloveTop, this.gloveBottom);

    const sleeveMat = addRim(new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.85 }), 0.3);
    const sleeveGeo = new THREE.CylinderGeometry(0.036, 0.052, 1, 16, 1, true);
    sleeveGeo.translate(0, 0.5, 0);
    this.sleeves = [new THREE.Mesh(sleeveGeo, sleeveMat), new THREE.Mesh(sleeveGeo, sleeveMat)];
    this.rig.add(...this.sleeves);

    // Faint swing trail behind the blade.
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 6), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 6), 3));
    const idx = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(
      tg,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.trail.frustumCulled = false;
    this.rig.add(this.trail);
    this.trailPts = [];

    this.grip = new THREE.Vector3(0.08, -0.25, -0.72);
    this.dir = new THREE.Vector3(0, -1, -0.3).normalize();
    this.assistTarget = null;
    this.assistAmount = 0;
    this._t = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
  }

  setHand(hand) {
    this.hand = hand;
  }

  show(on) {
    this.rig.visible = on;
  }

  /** Pull the sweet spot towards a point (camera space) around contact. */
  assist(target, amount) {
    this.assistTarget = target ? target.clone() : null;
    this.assistAmount = amount;
  }

  /**
   * @param {object} s bat state from BatInput: gx, gy (calibrated grip),
   *   angle (on-screen direction of the blade, radians, y up), ratio (how
   *   side-on the stick is: 1 = flat to the camera, small = pointing at it)
   * @param {number} glow swing trail strength 0..1
   */
  update(s, glow = 0) {
    const gx = THREE.MathUtils.clamp(s.gx, -2, 2);
    const gy = THREE.MathUtils.clamp(s.gy, -1.6, 2);
    const target = this._t.a.set(0.1 * this.hand + gx * 0.3, -0.1 + gy * 0.25, -0.82 - Math.max(0, -gy) * 0.05);
    this.grip.lerp(target, 0.6);
    const r = THREE.MathUtils.clamp(s.ratio ?? 0.85, 0.15, 1);
    const d = this._t.b.set(Math.cos(s.angle) * r, Math.sin(s.angle) * r, -Math.sqrt(1 - r * r) - 0.5).normalize();
    this.dir.lerp(d, 0.6).normalize();

    // Around contact, ease the sweet spot towards the ball so they visibly meet.
    let grip = this.grip;
    let dir = this.dir;
    if (this.assistTarget && this.assistAmount > 0) {
      const sweet = this._t.c.copy(this.grip).addScaledVector(this.dir, 0.1 + BLADE * 0.6);
      const off = this.assistTarget.clone().sub(sweet).multiplyScalar(this.assistAmount);
      grip = this.grip.clone().add(off);
    }
    const top = grip.clone().addScaledVector(dir, -0.18);
    const face = new THREE.Vector3(-0.25 * this.hand, 0.1, -1);
    aimBat(this.bat, top, dir, face);

    // Sleeves from below the screen to each glove's cuff.
    this.bat.updateMatrix();
    this.rig.updateMatrix();
    // Forearms only, angled in from the elbows at the bottom corners, so the
    // blade between them stays in view.
    // Both forearms come from the side the hands are on.
    const lean = THREE.MathUtils.clamp(grip.x * 6, -1, 1) || this.hand;
    this.side = this.side === undefined ? lean : this.side + (lean - this.side) * 0.12;
    const sx = this.side >= 0 ? 1 : -1;
    const elbows = [new THREE.Vector3(0.3 * sx, -0.6, -0.38), new THREE.Vector3(0.5 * sx, -0.58, -0.3)];
    const gloves = [this.gloveTop, this.gloveBottom];
    for (let i = 0; i < 2; i++) {
      const cuff = new THREE.Vector3(0, gloves[i].position.y - 0.02, -0.07).applyMatrix4(this.bat.matrix);
      const along = cuff.clone().sub(elbows[i]);
      const len = Math.max(0.05, Math.min(0.42, along.length()));
      along.normalize();
      const sl = this.sleeves[i];
      sl.position.copy(cuff).addScaledVector(along, -len);
      sl.scale.set(1, len, 1);
      sl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    }

    // Trail from the middle of the blade to the toe.
    const mid = new THREE.Vector3(0, -0.25, 0).applyMatrix4(this.bat.matrix);
    const toe = new THREE.Vector3(0, -BLADE, 0).applyMatrix4(this.bat.matrix);
    this.trailPts.unshift([mid, toe]);
    if (this.trailPts.length > TRAIL) this.trailPts.pop();
    const pos = this.trail.geometry.attributes.position;
    const col = this.trail.geometry.attributes.color;
    const k0 = THREE.MathUtils.clamp(glow, 0, 1) * 0.5;
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      pos.setXYZ(i * 2, p[0].x, p[0].y, p[0].z);
      pos.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const k = k0 * (1 - i / TRAIL);
      col.setXYZ(i * 2, k * 0.8, k * 0.9, k);
      col.setXYZ(i * 2 + 1, k, k, k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Sweet spot of the blade in world space. */
  sweetSpot(out = new THREE.Vector3()) {
    this.bat.updateWorldMatrix(true, false);
    return this.bat.localToWorld(out.set(0, -BLADE * 0.6, 0));
  }
}
