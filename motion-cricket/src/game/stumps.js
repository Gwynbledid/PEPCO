import * as THREE from 'three';
import { toonMaterial } from './characters.js';

// A set of stumps with bails. The striker's set can be knocked over.
export function buildStumps(scene, z) {
  const group = new THREE.Group();
  group.position.set(0, 0, z);
  const wood = toonMaterial(0xf3e7c9, { roughness: 0.45, rim: 0.25 });
  const band = toonMaterial(0x0b6e61, { roughness: 0.5 });
  const stumpGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.71, 12);
  const bandGeo = new THREE.CylinderGeometry(0.0185, 0.0185, 0.07, 12);
  const home = [-0.11, 0, 0.11];
  const stumps = home.map((x) => {
    const s = new THREE.Group();
    const m = new THREE.Mesh(stumpGeo, wood);
    m.position.y = 0.355;
    m.castShadow = true;
    const b = new THREE.Mesh(bandGeo, band);
    b.position.y = 0.52;
    s.add(m, b);
    s.position.x = x;
    group.add(s);
    return s;
  });
  const bailGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.108, 8);
  const bails = [-0.055, 0.055].map((x) => {
    const b = new THREE.Mesh(bailGeo, wood);
    b.castShadow = true;
    group.add(b);
    return b;
  });
  const reset = () => {
    stumps.forEach((s, i) => {
      s.position.set(home[i], 0, 0);
      s.rotation.set(0, 0, 0);
    });
    bails.forEach((b, i) => {
      b.position.set([-0.055, 0.055][i], 0.715, 0);
      b.rotation.set(0, 0, Math.PI / 2);
    });
  };
  reset();
  group.userData = {
    reset,
    /** Stumps cartwheel and the bails fly, t seconds after the ball hit them. */
    knock(t, vx = 0) {
      const k = Math.min(1, t / 0.35);
      stumps[1].rotation.x = 0.55 * k;
      stumps[0].rotation.z = (0.25 + vx) * k;
      stumps[2].rotation.z = (-0.3 + vx) * k;
      bails.forEach((b, i) => {
        const dir = i ? 1 : -1;
        b.position.set(dir * (0.055 + t * 0.9), Math.max(0.01, 0.715 + t * 2.4 - 4.9 * t * t), t * 1.6);
        b.rotation.x += 0.2;
      });
    },
  };
  scene.add(group);
  return group;
}
