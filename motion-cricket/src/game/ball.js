import * as THREE from 'three';
import { BALL_RADIUS } from './config.js';
import { ballCanvas, puffCanvas, softShadowCanvas, toTexture } from './textures.js';

// The ball as seen: slightly enlarged so it reads on a phone, spinning on
// its seam, with a soft trail, a ground shadow and a puff of dust where it
// pitches.

const VISUAL_SCALE = 1.35;
const TRAIL = 14;

export class BallView {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS * VISUAL_SCALE, 24, 16),
      new THREE.MeshStandardMaterial({ map: toTexture(ballCanvas()), roughness: 0.32, metalness: 0.05 }),
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.34),
      new THREE.MeshBasicMaterial({ map: toTexture(softShadowCanvas()), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
    tg.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL), 1));
    this.trail = new THREE.Line(
      tg,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(1, 0.92, 0.9) } },
        vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor, vA * 0.45); }`,
      }),
    );
    this.trail.frustumCulled = false;
    scene.add(this.trail);
    this.points = [];

    this.puffs = [];
    const puffTex = toTexture(puffCanvas());
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, depthWrite: false, transparent: true, opacity: 0 }));
      s.visible = false;
      scene.add(s);
      this.puffs.push({ s, life: 0, v: new THREE.Vector3() });
    }
    this.spinAxis = new THREE.Vector3(1, 0, 0);
    this.show(false);
  }

  show(on) {
    this.mesh.visible = on;
    this.shadow.visible = on;
    this.trail.visible = on;
    if (!on) this.points = [];
  }

  /** Sets the spin axis from a velocity (backspin for deliveries, topspin-ish for hits). */
  spinFrom(v) {
    this.spinAxis.set(-v.z, 0, v.x).normalize();
    if (!Number.isFinite(this.spinAxis.x)) this.spinAxis.set(1, 0, 0);
  }

  setPosition(p, dt = 0) {
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.rotateOnWorldAxis(this.spinAxis, dt * 40);
    this.shadow.position.set(p.x, 0.012, p.z);
    const k = Math.max(0.35, 1 - p.y / 20);
    this.shadow.scale.setScalar(k);
    this.shadow.material.opacity = Math.max(0.15, 1 - p.y / 25);
    this.points.unshift(new THREE.Vector3(p.x, p.y, p.z));
    if (this.points.length > TRAIL) this.points.pop();
    const pos = this.trail.geometry.attributes.position;
    const al = this.trail.geometry.attributes.alpha;
    for (let i = 0; i < TRAIL; i++) {
      const q = this.points[Math.min(i, this.points.length - 1)];
      pos.setXYZ(i, q.x, q.y, q.z);
      al.setX(i, i < this.points.length ? 1 - i / TRAIL : 0);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
  }

  dust(p) {
    for (const d of this.puffs) {
      d.life = 0.5 + Math.random() * 0.25;
      d.max = d.life;
      d.s.visible = true;
      d.s.position.set(p.x + (Math.random() - 0.5) * 0.1, 0.05, p.z + (Math.random() - 0.5) * 0.1);
      d.v.set((Math.random() - 0.5) * 0.9, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.9);
    }
  }

  update(dt) {
    for (const d of this.puffs) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const t = 1 - d.life / d.max;
      d.s.position.addScaledVector(d.v, dt);
      d.s.scale.setScalar(0.08 + t * 0.35);
      d.s.material.opacity = (1 - t) * 0.7;
      if (d.life <= 0) d.s.visible = false;
    }
  }
}
