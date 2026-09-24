import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Film look for the reference style:
//   scene (HDR, MSAA, depth) → soft background blur + warm grade + vignette
//   → bloom (floodlights, sunlit clouds) → tone mapping and sRGB output.
// The background blur only ever blurs FAR things (stands, sky), so the bat,
// ball and batter stay crisp, like a shallow depth of field on a big lens.

const POISSON = [
  [0.0, 0.0], [0.53, 0.18], [-0.35, 0.47], [-0.29, -0.51], [0.39, -0.46],
  [0.93, -0.12], [-0.86, 0.12], [0.06, 0.95], [0.2, -0.97], [-0.62, -0.75],
  [0.7, 0.66], [-0.7, 0.66],
];

export class PostFX {
  constructor(renderer, { bloom = true, blur = true, msaa = 4 } = {}) {
    this.renderer = renderer;
    this.useBlur = blur;
    this.useBloom = bloom;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: msaa,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.gradeRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.grade = new FullScreenQuad(
      new THREE.ShaderMaterial({
        defines: { USE_BLUR: blur ? 1 : 0 },
        uniforms: {
          tColor: { value: null },
          tDepth: { value: null },
          near: { value: 0.03 },
          far: { value: 4000 },
          focusStart: { value: 45 },
          focusRange: { value: 110 },
          maxRadius: { value: 3.5 },
          texel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) },
          vignette: { value: 0.28 },
          warmth: { value: 0.04 },
          saturation: { value: 1.12 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tColor, tDepth;
          uniform float near, far, focusStart, focusRange, maxRadius, vignette, warmth, saturation;
          uniform vec2 texel;
          varying vec2 vUv;
          float linDepth(float d) {
            float z = d * 2.0 - 1.0;
            return 2.0 * near * far / (far + near - z * (far - near));
          }
          float coc(vec2 uv) {
            float d = linDepth(texture2D(tDepth, uv).x);
            // Stands and far fielders soften; the sky and clouds stay crisp.
            return clamp((d - focusStart) / focusRange, 0.0, 1.0) * (1.0 - smoothstep(260.0, 420.0, d));
          }
          void main() {
            vec3 col = texture2D(tColor, vUv).rgb;
            #if USE_BLUR
            float c = coc(vUv);
            if (c > 0.02) {
              vec3 acc = col;
              float wsum = 1.0;
              ${POISSON.map(([x, y]) => `{
                vec2 o = vec2(${x.toFixed(2)}, ${y.toFixed(2)}) * c * maxRadius * texel;
                float w = coc(vUv + o);
                acc += texture2D(tColor, vUv + o).rgb * w;
                wsum += w;
              }`).join('\n')}
              col = acc / wsum;
            }
            #endif
            // Warm, saturated grade.
            float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(l), col, saturation);
            col *= vec3(1.0 + warmth, 1.0 + warmth * 0.35, 1.0 - warmth * 0.6);
            vec2 v = vUv - 0.5;
            col *= 1.0 - vignette * smoothstep(0.35, 0.85, length(v * vec2(1.1, 1.0)));
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.38, 0.5, 1.5);
    }
    this.output = new OutputPass();
    this.output.renderToScreen = true;
  }

  setSize(w, h) {
    this.sceneRT.setSize(w, h);
    this.sceneRT.depthTexture.image.width = w;
    this.sceneRT.depthTexture.image.height = h;
    this.gradeRT.setSize(w, h);
    this.grade.material.uniforms.texel.value.set(1 / w, 1 / h);
    if (this.bloom) this.bloom.setSize(w / 2, h / 2);
  }

  /** Depth of field for the cinematic cameras: focus on the batter, blur the rest. */
  setFocus(start, range, radius) {
    const u = this.grade.material.uniforms;
    u.focusStart.value = start;
    u.focusRange.value = range;
    u.maxRadius.value = radius;
  }

  render(scene, camera, dt) {
    const r = this.renderer;
    const u = this.grade.material.uniforms;
    u.near.value = camera.near;
    u.far.value = camera.far;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    u.tColor.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    r.setRenderTarget(this.gradeRT);
    this.grade.render(r);
    if (this.bloom) this.bloom.render(r, null, this.gradeRT, dt, false);
    this.output.render(r, null, this.gradeRT);
    r.setRenderTarget(null);
  }

  dispose() {
    this.sceneRT.dispose();
    this.gradeRT.dispose();
    this.bloom?.dispose();
    this.output.dispose();
    this.grade.dispose();
  }
}
