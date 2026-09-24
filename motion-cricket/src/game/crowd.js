import * as THREE from 'three';
import { FIELD_CENTER } from './config.js';
import { PAVILION, TIERS } from './stadium.js';
import { HAIRS, SHIRTS, SKINS, crowdAtlasCanvas, rng, toTexture } from './textures.js';
import { SUN_DIR } from './sky.js';

// Thousands of spectators as instanced billboards: each one a sprite from a
// 4-pose atlas, coloured per instance (shirt, skin, hair), idling, clapping,
// and jumping up when a big shot comes their way.

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

export function buildCrowd(scene, { density = 1 }) {
  const r = rng(31);
  const offsets = [];
  const facing = [];
  const shirt = [];
  const skin = [];
  const hair = [];
  const params = [];
  const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const shirtC = SHIRTS.map(lin);
  const skinC = SKINS.map(lin);
  const hairC = HAIRS.map(lin);
  const spacing = 0.62 / Math.max(0.2, density);
  const addTier = (tier, shadeTop) => {
    for (let row = 0; row < tier.rows; row++) {
      const k = (row + 0.5) / tier.rows;
      const rr = tier.r0 + (tier.r1 - tier.r0) * k;
      const y = tier.y0 + (tier.y1 - tier.y0) * k;
      const n = Math.floor((TAU * rr) / spacing);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + (row % 2) * (TAU / n / 2);
        // Sight screens and aisles stay empty; so do some seats.
        const s = Math.sin(a);
        if (Math.abs(s) < 0.16 && row < 10) continue;
        if (((a / DEG) % 7.5 + 7.5) % 7.5 < 0.55) continue;
        if (r() < 0.07) continue;
        offsets.push(FIELD_CENTER.x + Math.sin(a) * rr, y, FIELD_CENTER.z - Math.cos(a) * rr);
        facing.push(a);
        const c1 = shirtC[Math.floor(r() * shirtC.length)];
        const c2 = skinC[Math.floor(r() * skinC.length)];
        const c3 = r() < 0.18 ? shirtC[Math.floor(r() * shirtC.length)] : hairC[Math.floor(r() * hairC.length)];
        shirt.push(c1.r, c1.g, c1.b);
        skin.push(c2.r, c2.g, c2.b);
        hair.push(c3.r, c3.g, c3.b);
        // phase, base pose (0 relaxed / 1 clapping), excitability, shade under the roof
        const shade = shadeTop ? 1 - 0.35 * Math.max(0, (k - 0.35) / 0.65) : 1;
        params.push(r() * TAU, r() < 0.25 ? 1 : 0, 0.5 + r() * 0.5, shade);
      }
    }
  };
  addTier(TIERS.lower, false);
  addTier(TIERS.upper, true);

  const quad = new THREE.PlaneGeometry(0.66, 0.99);
  quad.translate(0, 0.42, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.attributes.position = quad.attributes.position;
  geo.attributes.uv = quad.attributes.uv;
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
  geo.setAttribute('aFacing', new THREE.InstancedBufferAttribute(new Float32Array(facing), 1));
  geo.setAttribute('aShirt', new THREE.InstancedBufferAttribute(new Float32Array(shirt), 3));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(new Float32Array(skin), 3));
  geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(new Float32Array(hair), 3));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(new Float32Array(params), 4));
  geo.instanceCount = facing.length;

  const atlas = toTexture(crowdAtlasCanvas(), { srgb: false });
  atlas.generateMipmaps = true;
  const uniforms = {
    uAtlas: { value: atlas },
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uExciteDir: { value: new THREE.Vector2(0, -1) },
    uSun: { value: new THREE.Vector3().copy(SUN_DIR) },
    uSunColor: { value: new THREE.Color('#ffe8c8').convertSRGBToLinear() },
    uAmbient: { value: new THREE.Color('#9fb8d6').convertSRGBToLinear() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute float aFacing;
      attribute vec3 aShirt, aSkin, aHair;
      attribute vec4 aParams;
      uniform float uTime, uExcite;
      uniform vec2 uExciteDir;
      varying vec2 vUv;
      varying vec3 vShirt, vSkin, vHair;
      varying float vLight, vShade;
      varying float vPose;
      uniform vec3 uSun;
      void main() {
        float ph = aParams.x;
        // Excitement is strongest in the stands the ball is heading for.
        vec2 dir = vec2(sin(aFacing), -cos(aFacing));
        float near = 0.35 + 0.65 * smoothstep(0.2, 0.95, dot(dir, uExciteDir));
        float ex = clamp(uExcite * near * aParams.z, 0.0, 1.0);
        float jump = ex * max(0.0, sin(uTime * 9.0 + ph)) * 0.32;
        float idle = sin(uTime * 1.3 + ph) * 0.015;
        // Pose: cheering arms when excited, else relaxed or clapping.
        float pose = ex > 0.35 ? (fract(ph) > 0.5 ? 2.0 : 3.0) : aParams.y;
        if (pose == 1.0 && fract(uTime * 2.2 + ph) > 0.5) pose = 0.0;
        vPose = pose;
        vUv = uv;
        vec3 p = position;
        p.y += jump + idle;
        // Face the middle of the ground.
        float c = cos(aFacing), s = sin(aFacing);
        vec3 w = vec3(p.x * c, p.y, p.x * s) + aOffset;
        vShirt = aShirt; vSkin = aSkin; vHair = aHair;
        vec3 n = vec3(-sin(aFacing), 0.0, cos(aFacing));
        vLight = max(dot(n, normalize(uSun)), 0.0);
        vShade = aParams.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform vec3 uSunColor, uAmbient;
      varying vec2 vUv;
      varying vec3 vShirt, vSkin, vHair;
      varying float vLight, vShade, vPose;
      void main() {
        vec2 uv = vec2((vUv.x + vPose) * 0.25, vUv.y);
        vec4 m = texture2D(uAtlas, uv);
        if (m.a < 0.5) discard;
        float sum = max(m.r + m.g + m.b, 1e-3);
        vec3 albedo = (vShirt * m.r + vSkin * m.g + vHair * m.b) / sum;
        // Soft shading: darker at the bottom, lit by the sun from the front.
        float grad = mix(0.72, 1.0, vUv.y);
        vec3 col = albedo * (uAmbient * 0.75 + uSunColor * (0.35 + 0.75 * vLight)) * grad * vShade;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  let excite = 0;
  return {
    mesh,
    count: facing.length,
    /** Big shot: the crowd on that side jumps up. `dir` is the ball's heading (x, z). */
    cheer(level = 1, dir = null) {
      excite = Math.max(excite, level);
      if (dir) uniforms.uExciteDir.value.set(dir.x, dir.z).normalize();
      else uniforms.uExciteDir.value.set(0, 0);
    },
    update(t, dt) {
      excite = Math.max(0, excite - dt * 0.28);
      uniforms.uTime.value = t;
      uniforms.uExcite.value = excite;
    },
  };
}

export { PAVILION };
