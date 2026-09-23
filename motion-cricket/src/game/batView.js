import * as THREE from 'three';
import { batFaceCanvas, toTexture } from './textures.js';

// The first-person bat, gloves and sleeves. Everything is parented to the
// camera, so it moves with the player's view. Bat local frame: the handle
// is at the origin (between the gloves), the blade hangs down -Y and the
// face points +Z.

const TRAIL = 10;

export class BatView {
  constructor(camera, assets) {
    this.camera = camera;
    this.hand = 1;
    this.rig = new THREE.Group();
    camera.add(this.rig);

    const faceTex = toTexture(batFaceCanvas(assets.batSticker));
    const willow = new THREE.MeshStandardMaterial({ color: 0xecd3a0, roughness: 0.55 });
    const face = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 });
    const bat = new THREE.Group();
    // Blade: flat face (+Z) and a raised spine on the back.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.108, 0.56, 0.035), [willow, willow, willow, willow, face, face]);
    blade.position.y = -0.46;
    bat.add(blade);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.54, 16, 1, false, Math.PI / 2, Math.PI), willow);
    spine.scale.set(1.15, 1, 0.55);
    spine.position.set(0, -0.46, -0.016);
    bat.add(spine);
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.035, 16, 1, false, Math.PI / 2, Math.PI), willow);
    toe.rotation.x = Math.PI / 2;
    toe.rotation.z = Math.PI;
    toe.scale.set(1, 1, 0.5);
    toe.position.set(0, -0.74, 0);
    bat.add(toe);
    // Handle with a rubber grip.
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.019, 0.3, 12),
      new THREE.MeshStandardMaterial({ color: 0x1b2a5a, roughness: 0.8 }),
    );
    grip.position.y = -0.03;
    bat.add(grip);
    this.bat = bat;
    this.rig.add(bat);

    // Gloves: white padded mitts with teal and navy trim.
    const glove = new THREE.MeshStandardMaterial({ color: 0xf8f8f5, roughness: 0.65 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x0d6b73, roughness: 0.6 });
    // Each glove: a padded back-of-hand, four sausage finger rolls wrapped
    // around the handle, and a coloured wrist cuff.
    const mkGlove = (y, side) => {
      const g = new THREE.Group();
      const back = new THREE.Mesh(new THREE.SphereGeometry(0.042, 18, 14), glove);
      back.scale.set(1.0, 1.15, 0.8);
      back.position.set(side * 0.022, 0, -0.012);
      g.add(back);
      for (let i = 0; i < 4; i++) {
        const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0125, 0.045, 4, 10), glove);
        finger.rotation.z = Math.PI / 2;
        finger.position.set(-side * 0.004, 0.03 - i * 0.02, 0.022);
        g.add(finger);
      }
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.035, 16), trim);
      cuff.rotation.z = Math.PI / 2;
      cuff.position.set(side * 0.06, 0, -0.012);
      g.add(cuff);
      g.position.y = y;
      bat.add(g);
      return g;
    };
    this.gloveTop = mkGlove(0.06, 1);
    this.gloveBottom = mkGlove(-0.045, 1);

    // Sleeves from each glove down out of the bottom of the screen.
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.8 });
    const sleeveGeo = new THREE.CylinderGeometry(0.032, 0.045, 1, 12, 1, true);
    sleeveGeo.translate(0, 0.5, 0);
    this.sleeves = [new THREE.Mesh(sleeveGeo, sleeveMat), new THREE.Mesh(sleeveGeo, sleeveMat)];
    this.sleeves.forEach((s) => this.rig.add(s));

    // Swing trail: a fading ribbon behind the blade.
    this.trailPts = [];
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    tg.setIndex(idx);
    this.trail = new THREE.Mesh(
      tg,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.trail.frustumCulled = false;
    this.rig.add(this.trail);

    this._tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), m: new THREE.Matrix4() };
    this.grip3 = new THREE.Vector3(0.1, -0.45, -0.62);
    this.dir3 = new THREE.Vector3(0, -1, -0.4).normalize();
  }

  setHand(hand) {
    this.hand = hand;
  }

  /** Places the bat from the calibrated input state. */
  update(state, swingBoost = 0) {
    const gx = THREE.MathUtils.clamp(state.gx, -1.8, 1.8);
    const gy = THREE.MathUtils.clamp(state.gy, -1.5, 1.8);
    const target = new THREE.Vector3(0.12 * this.hand + gx * 0.34, -0.2 + gy * 0.28, -0.82 - Math.max(0, -gy) * 0.06);
    this.grip3.lerp(target, 0.65);

    const d2x = Math.cos(state.angle);
    const d2y = Math.sin(state.angle);
    const dir = new THREE.Vector3(d2x, d2y, -0.95).normalize();
    this.dir3.lerp(dir, 0.6).normalize();

    // Orthonormal basis: blade down -Y along dir3, face roughly towards the
    // bowler with a slight twist so the edge shows.
    const yAxis = this.dir3.clone().negate();
    const faceHint = new THREE.Vector3(-0.35 * this.hand, 0, -1).normalize();
    const zAxis = faceHint.sub(yAxis.clone().multiplyScalar(faceHint.dot(yAxis))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    this._tmp.m.makeBasis(xAxis, yAxis, zAxis);
    this.bat.quaternion.setFromRotationMatrix(this._tmp.m);
    this.bat.position.copy(this.grip3);

    // Sleeves: from shoulders (below the camera) to the gloves.
    this.bat.updateMatrix();
    const shoulders = [new THREE.Vector3(-0.2, -0.6, -0.1), new THREE.Vector3(0.24, -0.62, -0.1)];
    const gloves = [this.gloveTop, this.gloveBottom];
    for (let i = 0; i < 2; i++) {
      const g = this._tmp.a.set(0.06, gloves[i].position.y, -0.012).applyMatrix4(this.bat.matrix);
      const s = shoulders[this.hand > 0 ? i : 1 - i];
      const sleeve = this.sleeves[i];
      const along = this._tmp.b.subVectors(g, s);
      const len = along.length() - 0.05;
      sleeve.position.copy(s);
      sleeve.scale.set(1, Math.max(0.05, len), 1);
      sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
    }

    // Trail from the blade's middle to its toe.
    const mid = new THREE.Vector3(0, -0.3, 0).applyMatrix4(this.bat.matrix);
    const toe = new THREE.Vector3(0, -0.74, 0).applyMatrix4(this.bat.matrix);
    this.trailPts.unshift([mid, toe]);
    if (this.trailPts.length > TRAIL) this.trailPts.pop();
    const pos = this.trail.geometry.attributes.position;
    const col = this.trail.geometry.attributes.color;
    const strength = THREE.MathUtils.clamp(swingBoost, 0, 1);
    for (let i = 0; i < TRAIL; i++) {
      const p = this.trailPts[Math.min(i, this.trailPts.length - 1)];
      pos.setXYZ(i * 2, p[0].x, p[0].y, p[0].z);
      pos.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const k = strength * (1 - i / TRAIL) * 0.55;
      col.setXYZ(i * 2, k * 0.6, k * 0.8, k);
      col.setXYZ(i * 2 + 1, k * 0.9, k, k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** World-space points along the blade (handle end to toe) for contact checks. */
  bladeSegment() {
    this.rig.updateMatrixWorld(true);
    const a = new THREE.Vector3(0, -0.2, 0);
    const b = new THREE.Vector3(0, -0.76, 0);
    this.bat.localToWorld(a);
    this.bat.localToWorld(b);
    return [a, b];
  }
}
