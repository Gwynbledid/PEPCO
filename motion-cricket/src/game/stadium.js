import * as THREE from 'three';
import {
  SPONSORS,
  boardCanvas,
  cloudCanvas,
  crowdCanvas,
  floodlightCanvas,
  glowCanvas,
  grassCanvas,
  pitchCanvas,
  rng,
  roofBannerCanvas,
  toTexture,
} from './textures.js';

// World layout (metres): the striker's stumps are at the origin and the
// bowler's stumps at z = -20.12. +X is to the right as the batter looks down
// the pitch. The ground is centred on the middle of the pitch.
export const PITCH_LENGTH = 20.12;
export const FIELD_CENTER = new THREE.Vector3(0, 0, -PITCH_LENGTH / 2);
export const BOUNDARY_RADIUS = 62;
const BOARD_RADIUS = 64;
const STAND_RADIUS = 72;

export function buildStadium(scene, assets, { lowSpec = false } = {}) {
  const root = new THREE.Group();
  scene.add(root);

  // Sky: gradient dome, optional painted panorama, cartoon clouds.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(0x1e6fe0) },
        mid: { value: new THREE.Color(0x58a6f5) },
        horizon: { value: new THREE.Color(0xcfe9ff) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
          c = mix(c, top, smoothstep(0.25, 0.9, h));
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  sky.renderOrder = -10;
  root.add(sky);

  if (assets.sky) {
    const tex = new THREE.Texture(assets.sky);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.repeat.set(4, 1);
    tex.needsUpdate = true;
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(850, 850, 700, 48, 1, true),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        uniforms: { map: { value: tex } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D map; varying vec2 vUv;
          void main(){ vec4 c = texture2D(map, vec2(vUv.x * 4.0, vUv.y));
            float a = 1.0 - smoothstep(0.8, 1.0, vUv.y);
            gl_FragColor = vec4(c.rgb, a); }`,
      }),
    );
    band.position.y = 300;
    band.renderOrder = -9;
    root.add(band);
  } else {
    const r = rng(3);
    const cloudTex = [1, 2, 3, 4, 5].map((s) => toTexture(cloudCanvas(s * 17)));
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({ map: cloudTex[i % cloudTex.length], depthWrite: false, fog: false });
      const s = new THREE.Sprite(mat);
      const ang = (i / 16) * Math.PI * 2 + r() * 0.3;
      const dist = 520 + r() * 180;
      const elev = 0.1 + r() * 0.42;
      s.position.set(Math.sin(ang) * dist, Math.tan(elev) * dist + 30, -Math.cos(ang) * dist);
      const w = 180 + r() * 220;
      s.scale.set(w, w * 0.5, 1);
      s.renderOrder = -8;
      root.add(s);
    }
  }

  // Outfield with mowing stripes computed from world position.
  const grassTex = toTexture(grassCanvas(assets.grass), { repeat: [1, 1] });
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, color: 0xffffff });
  grassMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace(
        '#include <map_fragment>',
        `vec4 sampledDiffuseColor = texture2D(map, vWorldP.xz / 3.2);
         diffuseColor *= sampledDiffuseColor;
         float stripe = step(0.5, fract(vWorldP.x / 7.0));
         diffuseColor.rgb *= mix(0.86, 1.08, stripe);
         float d = length(vWorldP.xz - vec2(0.0, ${FIELD_CENTER.z.toFixed(2)}));
         diffuseColor.rgb *= mix(1.0, 0.9, smoothstep(${BOUNDARY_RADIUS}.0, ${BOARD_RADIUS}.0, d));`,
      );
  };
  const field = new THREE.Mesh(new THREE.CircleGeometry(STAND_RADIUS + 2, 96), grassMat);
  field.rotation.x = -Math.PI / 2;
  field.position.copy(FIELD_CENTER);
  field.receiveShadow = true;
  root.add(field);

  // Pitch strip.
  const pitchTex = toTexture(pitchCanvas(assets.pitch));
  const pitch = new THREE.Mesh(
    new THREE.PlaneGeometry(3.05, 24.4),
    new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.9 }),
  );
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.012, FIELD_CENTER.z);
  pitch.receiveShadow = true;
  root.add(pitch);

  // Boundary rope.
  const rope = new THREE.Mesh(
    new THREE.TorusGeometry(BOUNDARY_RADIUS, 0.07, 6, 180),
    new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.6 }),
  );
  rope.rotation.x = Math.PI / 2;
  rope.position.set(0, 0.07, FIELD_CENTER.z);
  root.add(rope);

  // Advertising boards.
  const boardMats = SPONSORS.map(
    (s, i) => new THREE.MeshStandardMaterial({
      map: toTexture(boardCanvas(s, assets[`sponsor${i + 1}`])),
      roughness: 0.45,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
    }),
  );
  boardMats.forEach((m) => (m.emissiveMap = m.map));
  const boardGeo = new THREE.PlaneGeometry(6.2, 0.95);
  const nBoards = Math.round((2 * Math.PI * BOARD_RADIUS) / 6.3);
  for (let i = 0; i < nBoards; i++) {
    const a = (i / nBoards) * Math.PI * 2;
    const b = new THREE.Mesh(boardGeo, boardMats[i % boardMats.length]);
    b.position.set(Math.sin(a) * BOARD_RADIUS, 0.5, FIELD_CENTER.z - Math.cos(a) * BOARD_RADIUS);
    b.lookAt(FIELD_CENTER.x, 0.5, FIELD_CENTER.z);
    root.add(b);
  }

  // Sight screens at both ends (white, so the red ball stands out).
  const screenMat = new THREE.MeshStandardMaterial({ color: 0xf7f7f2, roughness: 0.8 });
  for (const dir of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 0.4), screenMat);
    s.position.set(0, 4, FIELD_CENTER.z + dir * (BOARD_RADIUS + 3));
    s.castShadow = false;
    root.add(s);
  }

  buildStands(root, assets, lowSpec);
  buildStumps(root, 0);
  buildStumps(root, -PITCH_LENGTH);
  return root;
}

function buildStands(root, assets, lowSpec) {
  const crowdTex = toTexture(crowdCanvas(assets.crowd), { repeat: [40, 1] });
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.95, side: THREE.DoubleSide });
  const upperTex = crowdTex.clone();
  upperTex.repeat.set(52, 1);
  upperTex.needsUpdate = true;
  const upperMat = new THREE.MeshStandardMaterial({ map: upperTex, roughness: 0.95, side: THREE.DoubleSide });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.9, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x137a64, roughness: 0.6, side: THREE.DoubleSide });
  const segs = lowSpec ? 72 : 128;

  const lathe = (pts, material) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs), material);
    m.position.copy(FIELD_CENTER);
    root.add(m);
    return m;
  };

  // Perimeter wall, lower tier, concourse, upper tier, roof. Kept fairly
  // low so the big cartoon sky stays in view, like the reference art.
  lathe([[STAND_RADIUS, 0], [STAND_RADIUS, 2.2]], concrete);
  lathe([[STAND_RADIUS + 0.5, 2.2], [STAND_RADIUS + 16, 9.5]], crowdMat);
  lathe([[STAND_RADIUS + 16, 9.5], [STAND_RADIUS + 16, 11.2], [STAND_RADIUS + 17.5, 11.2]], concrete);
  lathe([[STAND_RADIUS + 17.5, 11.6], [STAND_RADIUS + 30, 19.5]], upperMat);
  lathe([[STAND_RADIUS + 30, 19.5], [STAND_RADIUS + 31, 24]], concrete);
  lathe([[STAND_RADIUS + 32, 24], [STAND_RADIUS + 19, 26.5]], roofMat);

  // Roof fascia banner.
  // Negative repeat: the banner is seen from inside the cylinder.
  const bannerTex = toTexture(roofBannerCanvas(assets.roofBanner), { repeat: [-9, 1] });
  const banner = new THREE.Mesh(
    new THREE.CylinderGeometry(STAND_RADIUS + 19, STAND_RADIUS + 19, 2.6, segs, 1, true),
    new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.5, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.15 }),
  );
  banner.position.set(FIELD_CENTER.x, 25.4, FIELD_CENTER.z);
  root.add(banner);

  // Structural columns between bays.
  const colGeo = new THREE.BoxGeometry(0.6, 13, 0.6);
  const colMat = new THREE.MeshStandardMaterial({ color: 0xdcd2c0, roughness: 0.8 });
  const nCols = lowSpec ? 16 : 28;
  const cols = new THREE.InstancedMesh(colGeo, colMat, nCols);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < nCols; i++) {
    const a = (i / nCols) * Math.PI * 2;
    const r = STAND_RADIUS + 20;
    m4.makeTranslation(Math.sin(a) * r, 18.5, FIELD_CENTER.z - Math.cos(a) * r);
    cols.setMatrixAt(i, m4);
  }
  root.add(cols);

  // Floodlight towers.
  const panelTex = toTexture(floodlightCanvas());
  const glowTex = toTexture(glowCanvas());
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.5, metalness: 0.3 });
  const panelMat = new THREE.MeshBasicMaterial({ map: panelTex });
  for (const a of [0.7, 2.45, 3.85, 5.6]) {
    const r = STAND_RADIUS + 38;
    const x = Math.sin(a) * r;
    const z = FIELD_CENTER.z - Math.cos(a) * r;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.3, 52, 10), poleMat);
    pole.position.set(x, 26, z);
    root.add(pole);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 1), [poleMat, poleMat, poleMat, poleMat, panelMat, poleMat]);
    panel.position.set(x, 54, z);
    panel.lookAt(FIELD_CENTER.x, 10, FIELD_CENTER.z);
    root.add(panel);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(x * 0.985, 54, FIELD_CENTER.z + (z - FIELD_CENTER.z) * 0.985);
    glow.scale.set(40, 26, 1);
    root.add(glow);
  }
}

export function buildStumps(root, z) {
  const group = new THREE.Group();
  group.position.set(0, 0, z);
  const wood = new THREE.MeshStandardMaterial({ color: 0xf1e3c2, roughness: 0.5 });
  const stumpGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.71, 10);
  const stumps = [];
  for (const x of [-0.108, 0, 0.108]) {
    const s = new THREE.Mesh(stumpGeo, wood);
    s.position.set(x, 0.355, 0);
    s.castShadow = true;
    group.add(s);
    stumps.push(s);
  }
  const bailGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6);
  const bails = [];
  for (const x of [-0.054, 0.054]) {
    const b = new THREE.Mesh(bailGeo, wood);
    b.rotation.z = Math.PI / 2;
    b.position.set(x, 0.715, 0);
    group.add(b);
    bails.push(b);
  }
  root.add(group);
  group.userData = { stumps, bails };
  return group;
}
