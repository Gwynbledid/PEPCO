import * as THREE from 'three';
import { FIELD_CENTER } from './config.js';
import { PostFX } from './post.js';
import { SUN_DIR } from './sky.js';

// Renderer, scene, camera and lights, with quality presets. The look is a
// warm late afternoon: low golden sun behind the batter, blue sky fill,
// soft shadows, and a film grade on top.

export const QUALITY = {
  low: {
    name: 'low',
    pixelRatio: 1,
    post: false,
    shadow: 1024,
    crowd: 0.35,
    clouds: 10,
    cloudRes: 512,
    grassBlades: 0,
    stadiumSegments: 96,
  },
  medium: {
    name: 'medium',
    pixelRatio: 1.5,
    post: true,
    blur: false,
    bloom: true,
    msaa: 2,
    shadow: 1536,
    crowd: 0.65,
    clouds: 14,
    cloudRes: 1024,
    grassBlades: 0,
    stadiumSegments: 128,
  },
  high: {
    name: 'high',
    pixelRatio: 2,
    post: true,
    blur: true,
    bloom: true,
    msaa: 4,
    shadow: 2048,
    crowd: 1,
    clouds: 18,
    cloudRes: 1024,
    grassBlades: 24000,
    stadiumSegments: 160,
  },
};

export function pickQuality(setting) {
  if (QUALITY[setting]) return QUALITY[setting];
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  if (mobile) return cores >= 8 ? QUALITY.medium : QUALITY.low;
  return QUALITY.high;
}

export class World {
  constructor(canvas, quality) {
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !quality.post,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xcfe4f7, 260, 2400);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.03, 4000);
    scene.add(this.camera);

    // Golden sun, casting soft shadows over the whole playing area.
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.5);
    sun.position.set(FIELD_CENTER.x, 0, FIELD_CENTER.z).addScaledVector(SUN_DIR, 120);
    sun.target.position.set(FIELD_CENTER.x, 0, FIELD_CENTER.z);
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 58, bottom: -58, near: 20, far: 260 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sun = sun;
    // Blue sky from above, green bounce from the grass below.
    scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x5f8a33, 0.85));
    // Cool fill from the far side so shadowed faces aren't flat.
    const fill = new THREE.DirectionalLight(0xbcd7ff, 0.55);
    fill.position.set(40, 25, -60);
    scene.add(fill);

    scene.environment = this._environment();
    scene.environmentIntensity = 0.35;

    this.post = quality.post ? new PostFX(renderer, { bloom: quality.bloom, blur: quality.blur, msaa: quality.msaa }) : null;
    this.frameTimes = [];
    this.resize();
  }

  /** A small sky/ground gradient, prefiltered, for soft ambient reflections. */
  _environment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const colors = [];
    const top = new THREE.Color('#3f86e6');
    const hor = new THREE.Color('#dcecf7');
    const ground = new THREE.Color('#5d8f34');
    const c = new THREE.Color();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
      else c.copy(hor).lerp(ground, Math.min(1, -y * 3));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const tex = pmrem.fromScene(env, 0.02).texture;
    pmrem.dispose();
    return tex;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.baseFov = aspect >= 1 ? 58 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(34)) / aspect));
    this.camera.fov = this.fovOverride ?? this.baseFov;
    this.camera.updateProjectionMatrix();
    if (this.post) {
      const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.post.setSize(s.x, s.y);
    }
  }

  setFov(fov) {
    this.fovOverride = fov;
    const f = fov ?? this.baseFov;
    if (Math.abs(this.camera.fov - f) > 0.01) {
      this.camera.fov = f;
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt) {
    if (this.post) this.post.render(this.scene, this.camera, dt);
    else this.renderer.render(this.scene, this.camera);
    this._adapt(dt);
  }

  /** Steps quality down on slow devices so the game stays smooth. */
  _adapt(dt) {
    const f = this.frameTimes;
    f.push(dt);
    if (f.length < 180) return;
    const avg = f.reduce((a, b) => a + b, 0) / f.length;
    f.length = 0;
    if (avg < 1 / 38) return;
    const r = this.renderer;
    if (this.post && this.post.useBlur) {
      this.post.dispose();
      this.post = new PostFX(r, { bloom: this.quality.bloom, blur: false, msaa: 2 });
      this.resize();
    } else if (r.getPixelRatio() > 1) {
      r.setPixelRatio(Math.max(1, r.getPixelRatio() - 0.5));
      this.resize();
    } else if (this.post) {
      this.post.dispose();
      this.post = null;
      r.toneMapping = THREE.ACESFilmicToneMapping;
    }
    console.info('[quality] stepped down for a smoother frame rate');
  }
}
