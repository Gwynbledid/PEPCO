import * as THREE from 'three';
import { BOUNDARY_RADIUS, FIELD_CENTER, PITCH_LENGTH, STAND_RADIUS } from './config.js';
import { grassDetailCanvas, normalFromHeight, pitchCanvases, rng, toTexture } from './textures.js';

// The playing surface: lush striped outfield, the cricket square, the pitch,
// the 30-yard circle and the boundary rope.

export function buildField(scene, assets, { quality }) {
  const group = new THREE.Group();
  scene.add(group);

  const detail = toTexture(grassDetailCanvas(assets.grass), { repeat: [1, 1] });
  const grass = new THREE.MeshStandardMaterial({ map: detail, roughness: 0.92, metalness: 0 });
  grass.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vWorldP;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
        }
        float segDist(vec2 p, vec2 a, vec2 b) {
          vec2 pa = p - a, ba = b - a;
          float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
          return length(pa - ba * h);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 wp = vWorldP.xz;
        vec3 dA = texture2D(map, wp / 2.3).rgb;
        vec3 dB = texture2D(map, wp / 9.0 + 0.37).rgb;
        vec3 detailC = dA * 0.6 + dB * 0.4;
        // Lush, saturated base with gentle large-scale variation.
        float n = vnoise(wp * 0.045) * 0.6 + vnoise(wp * 0.17) * 0.4;
        vec3 base = mix(vec3(0.20, 0.47, 0.07), vec3(0.30, 0.60, 0.11), n);
        // Mowing stripes along the pitch, with a softer cross-cut.
        float stripe = step(0.5, fract((wp.x + 0.2) / 6.0));
        float cross = step(0.5, fract((wp.y + 4.0) / 12.0));
        float light = mix(0.86, 1.1, stripe) * mix(0.97, 1.03, cross);
        // Detail as brightness only (its base colour is ~0.355 luminance).
        float detailL = dot(detailC, vec3(0.2126, 0.7152, 0.0722)) / 0.355;
        vec3 col = base * light * mix(1.0, detailL, 0.85);
        // The cricket square: slightly paler, drier grass around the pitch.
        vec2 sq = abs(wp - vec2(0.0, ${FIELD_CENTER.z.toFixed(2)}));
        float square = 1.0 - smoothstep(0.0, 1.5, max(sq.x - 9.0, sq.y - 14.0));
        col = mix(col, col * vec3(1.06, 1.04, 0.86), square * 0.6);
        // 30-yard circle: dashed white line 27.4 m from both sets of stumps.
        float d30 = segDist(wp, vec2(0.0, 0.0), vec2(0.0, -${PITCH_LENGTH.toFixed(2)}));
        float ang = atan(wp.x, wp.y + ${(PITCH_LENGTH / 2).toFixed(2)});
        float dash = step(0.5, fract(ang * 38.0));
        col = mix(col, vec3(0.93), (1.0 - smoothstep(0.05, 0.12, abs(d30 - 27.4))) * dash * 0.9);
        // Beyond the rope: a darker apron up to the boards.
        float r = length(wp - vec2(0.0, ${FIELD_CENTER.z.toFixed(2)}));
        col *= mix(1.0, 0.82, smoothstep(${BOUNDARY_RADIUS.toFixed(1)}, ${(BOUNDARY_RADIUS + 1.5).toFixed(1)}, r));
        diffuseColor.rgb *= col;`,
      );
  };
  const outfield = new THREE.Mesh(new THREE.CircleGeometry(STAND_RADIUS + 1, 160), grass);
  outfield.rotation.x = -Math.PI / 2;
  outfield.position.set(FIELD_CENTER.x, 0, FIELD_CENTER.z);
  outfield.receiveShadow = true;
  group.add(outfield);

  // The pitch.
  const pc = pitchCanvases(assets.pitch);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: toTexture(pc.color),
    normalMap: toTexture(normalFromHeight(pc.bump, 3), { srgb: false }),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.95,
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 24.4), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.006, FIELD_CENTER.z);
  pitch.receiveShadow = true;
  group.add(pitch);

  // Boundary rope with a thin padded cushion.
  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(BOUNDARY_RADIUS, 0.09, 8, 240),
    new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 }),
  );
  rope.rotation.x = Math.PI / 2;
  rope.position.set(FIELD_CENTER.x, 0.09, FIELD_CENTER.z);
  group.add(rope);

  if (quality.grassBlades) group.add(buildBlades(quality.grassBlades));
  return group;
}

/**
 * Real grass blades around the batter's end, for the low cinematic cameras
 * (menu and six replays), which sit close to the ground.
 */
function buildBlades(count) {
  const blade = new THREE.BufferGeometry();
  // A tapered blade: 5 vertices, 3 triangles, bending slightly.
  const w = 0.006;
  const pos = new Float32Array([-w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0.01, w * 0.6, 0.5, 0.01, 0, 1, 0.04]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1]);
  blade.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  blade.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  blade.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vH;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vH = uv.y;
        vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
        float sway = sin(uTime * 1.7 + ip.x * 0.8 + ip.z * 0.6) * 0.08 + sin(uTime * 3.1 + ip.x * 2.1) * 0.03;
        transformed.x += sway * uv.y * uv.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.45, 1.05, vH);');
  };
  const mesh = new THREE.InstancedMesh(blade, mat, count);
  const r = rng(99);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  let i = 0;
  while (i < count) {
    const x = (r() - 0.5) * 14;
    const z = -7 + r() * 12;
    if (Math.abs(x) < 1.6 && z < 1.4) continue; // not on the pitch
    p.set(x, 0, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
    const h = 0.03 + r() * 0.04;
    s.set(1 + r() * 0.5, h, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    col.setHSL(0.24 + r() * 0.04, 0.72, 0.22 + r() * 0.12);
    mesh.setColorAt(i, col);
    i++;
  }
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.animate = (t) => {
    if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t;
  };
  return mesh;
}
