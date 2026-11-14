import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const FULLSCREEN_VERTEX = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

/** Screen-space god rays from the projected sun. SAMPLES is set by the quality preset. */
const RaysShader = {
  name: 'GodRays',
  defines: { SAMPLES: 64 },
  uniforms: {
    tDiffuse: { value: null },
    sunPos: { value: new THREE.Vector2(0.5, 0.5) },
    strength: { value: 0.8 },
    threshold: { value: 1.1 },
  },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 sunPos; uniform float strength, threshold; varying vec2 vUv;
    void main(){
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (strength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 delta = (vUv - sunPos) * (0.92 / float(SAMPLES));
      float dith = fract(sin(dot(vUv * 1000.0, vec2(12.9898, 78.233))) * 43758.5453);
      vec2 uv = vUv - delta * dith; float decay = 1.0; vec3 acc = vec3(0.0);
      float decayStep = pow(0.962, 64.0 / float(SAMPLES));
      for (int i = 0; i < SAMPLES; i++) { uv -= delta; vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb; float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        float near = 1.0 - smoothstep(0.08, 0.32, distance(uv, sunPos));
        acc += s * (max(l - threshold, 0.0) / max(l, 0.001)) * decay * near; decay *= decayStep; }
      gl_FragColor = vec4(base + acc / float(SAMPLES) * strength * 3.2, 1.0);
    }`,
};

/** Saturation, split-tone (cool shadows, warm highlights) and vignette, after tone mapping. */
const GradeShader = {
  name: 'ColorGrade',
  uniforms: {
    tDiffuse: { value: null },
    sat: { value: 1.12 },
    vignette: { value: 0.32 },
    shadowTint: { value: new THREE.Vector3(0.1, 0.2, 0.5) },
    highTint: { value: new THREE.Vector3(0.6, 0.42, 0.12) },
  },
  vertexShader: FULLSCREEN_VERTEX,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, vignette; uniform vec3 shadowTint, highTint; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126,0.7152,0.0722)); c = mix(vec3(l), c, sat);
      c += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)) * 0.07 + highTint * smoothstep(0.55, 1.0, l) * 0.06;
      float v = smoothstep(0.9, 0.3, length(vUv - 0.5) * 1.15); c *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = vec4(c, 1.0); }`,
};

export interface PostStack {
  composer: EffectComposer;
  rays: ShaderPass;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  setRaySamples(samples: number): void;
}

/** RenderPass → god rays → bloom → OutputPass (tone map + sRGB) → colour grade. */
export function createPostStack(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostStack {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const rays = new ShaderPass(RaysShader);
  composer.addPass(rays);
  const size = renderer.getSize(new THREE.Vector2());
  const bloom = new UnrealBloomPass(size, 0.45, 0.42, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  return {
    composer,
    rays,
    bloom,
    grade,
    setSize: (width, height) => composer.setSize(width, height),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    setRaySamples(samples) {
      const material = rays.material;
      if (material.defines.SAMPLES === samples) return;
      material.defines.SAMPLES = samples;
      material.needsUpdate = true;
    },
  };
}
