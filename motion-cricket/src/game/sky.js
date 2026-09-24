import * as THREE from 'three';
import { FIELD_CENTER } from './config.js';
import { cloudCanvas, rng, toTexture } from './textures.js';

// Golden-hour sun behind the batter's left shoulder: the field ahead is
// front-lit and shadows stretch towards the bowler, as in the reference.
export const SUN_DIR = new THREE.Vector3(-0.55, 0.52, 0.66).normalize();

export function buildSky(scene, assets, { quality }) {
  const group = new THREE.Group();
  scene.add(group);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color('#1c5ed4') },
        mid: { value: new THREE.Color('#3a86ea') },
        horizon: { value: new THREE.Color('#8cc4f5') },
        haze: { value: new THREE.Color('#f8e6c6') },
        sunDir: { value: SUN_DIR },
        sunColor: { value: new THREE.Color('#fff1d6') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 zenith, mid, horizon, haze, sunDir, sunColor;
        varying vec3 vDir;
        #include <common>
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, mid, smoothstep(-0.02, 0.13, h));
          col = mix(col, zenith, smoothstep(0.2, 0.9, h));
          // Warm haze low on the horizon, strongest towards the sun.
          float sunSide = 0.5 + 0.5 * dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(sunDir.xz));
          col = mix(col, haze, (1.0 - smoothstep(0.0, 0.08, h)) * (0.2 + 0.3 * sunSide));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 6.0) * 0.18 + pow(s, 900.0) * 6.0);
          if (h < 0.0) col = mix(col, horizon * 0.9, clamp(-h * 6.0, 0.0, 1.0));
          // Dither against banding.
          col += (rand(gl_FragCoord.xy) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  if (assets.sky) {
    // A painted panorama replaces the procedural clouds.
    const tex = new THREE.Texture(assets.sky);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.needsUpdate = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(1400, 1400, 1100, 64, 1, true),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, depthWrite: false, fog: false }),
    );
    tex.repeat.set(3, 1);
    band.position.y = 420;
    band.renderOrder = -9;
    group.add(band);
    return group;
  }

  // Cartoon cumulus: big billboards around the stadium, lit from the sun's side.
  const r = rng(12);
  const size = quality.cloudRes;
  const textures = new Map();
  const texFor = (seed, light) => {
    const key = `${seed}_${light}`;
    if (!textures.has(key)) {
      const canvas = cloudCanvas(seed, light);
      let src = canvas;
      if (size < 1024) {
        src = document.createElement('canvas');
        src.width = size;
        src.height = size / 2;
        src.getContext('2d').drawImage(canvas, 0, 0, src.width, src.height);
      }
      textures.set(key, toTexture(src));
    }
    return textures.get(key);
  };
  // Three bands of cloud, spread round the sky with blue gaps between them.
  const count = quality.clouds;
  const bands = [
    { share: 0.45, elev: [0.14, 0.3], width: [300, 520], dist: [640, 820] },
    { share: 0.35, elev: [0.36, 0.62], width: [320, 520], dist: [700, 880] },
    { share: 0.2, elev: [0.75, 1.05], width: [280, 420], dist: [760, 900] },
  ];
  let i = 0;
  for (const band of bands) {
    const n = Math.max(2, Math.round(count * band.share));
    const offset = r() * Math.PI * 2;
    for (let k = 0; k < n; k++, i++) {
      const ang = offset + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.35;
      const dist = band.dist[0] + r() * (band.dist[1] - band.dist[0]);
      const elev = band.elev[0] + r() * (band.elev[1] - band.elev[0]);
      const dir = new THREE.Vector3(Math.sin(ang), 0, -Math.cos(ang));
      // Which side of this cloud faces the sun, as seen from the ground.
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      const light = Math.round(THREE.MathUtils.clamp(right.dot(SUN_DIR) * 1.6, -1, 1) * 2) / 2;
      const mat = new THREE.SpriteMaterial({ map: texFor(1 + (i % 5) * 17, light), depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      const horiz = Math.cos(elev) * dist;
      s.position.set(FIELD_CENTER.x + dir.x * horiz, Math.sin(elev) * dist, FIELD_CENTER.z + dir.z * horiz);
      const w = band.width[0] + r() * (band.width[1] - band.width[0]);
      s.scale.set(w, w * 0.5, 1);
      s.renderOrder = -8;
      group.add(s);
    }
  }
  return group;
}
