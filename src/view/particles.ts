import * as THREE from 'three';
import { GLADE_CENTER, meadowHeightAt } from '../sim/terrain/meadow';
import type { SharedUniforms } from './look';

type Rand = () => number;
type Vec = [number, number, number];

export interface ParticleOptions {
  size: number;
  colA: string;
  colB: string;
  additive?: boolean;
  gain?: number;
  /** Falling speed (petals); 0 = hover. */
  fall?: number;
  drift?: number;
}

export type ParticlePoints = THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

/** GPU-animated point sprites (fireflies, motes, petals, sparks). */
export function createParticles(U: SharedUniforms, rand: Rand, count: number, place: (i: number) => Vec, options: ParticleOptions): ParticlePoints {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    positions.set(place(i), i * 3);
    seeds[i] = rand();
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: options.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      time: U.time,
      motion: U.motion,
      opacity: { value: 0 },
      size: { value: options.size },
      colA: { value: new THREE.Color(options.colA) },
      colB: { value: new THREE.Color(options.colB) },
      pixelRatio: U.pixelRatio,
      gain: { value: options.gain ?? 3 },
      fall: { value: options.fall ?? 0 },
      drift: { value: options.drift ?? 1 },
    },
    vertexShader: `
      attribute float aSeed; uniform float time, size, pixelRatio, opacity, fall, drift, motion; varying vec3 vC; varying float vA; uniform vec3 colA, colB;
      void main(){
        vec3 p = position;
        float dr = drift * motion;
        float fl = fall * mix(0.5, 1.0, motion);
        p.x += sin(time*0.5 + aSeed*6.28) * 1.2 * dr + time * fl * 0.6;
        p.z += cos(time*0.4 + aSeed*9.0) * 1.2 * dr + time * fl * 0.25;
        p.y += sin(time*0.7 + aSeed*12.0) * 0.6 * dr;
        if (fl > 0.0) { p.y = position.y + 8.0 - mod(time * fl + aSeed * 16.0, 16.0); p.x = position.x + mod(time*fl*0.6 + aSeed*30.0, 30.0) - 15.0; }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * (0.6 + aSeed * 0.8) * pixelRatio * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        float twinkle = mix(0.2, 0.55, motion);
        vA = opacity * (1.0 - twinkle + twinkle * sin(time * (2.0 + aSeed * 3.0) * mix(0.4, 1.0, motion) + aSeed * 40.0));
        vC = mix(colA, colB, step(0.82, aSeed));
      }`,
    fragmentShader: `
      uniform float gain; varying vec3 vC; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
        gl_FragColor = vec4(vC * gain, a * clamp(vA, 0.0, 1.0)); }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export interface MeadowParticles {
  fireflies: ParticlePoints;
  motes: ParticlePoints;
  petals: ParticlePoints;
  all: ParticlePoints[];
}

/** Fireflies (glade + meadow), golden dust motes and falling blossom petals. */
export function createMeadowParticles(U: SharedUniforms, rand: Rand): MeadowParticles {
  const onTerrain = (cx: number, cz: number, R: number, hMin: number, hMax: number) => (): Vec => {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * R;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    return [x, meadowHeightAt(x, z) + hMin + rand() * (hMax - hMin), z];
  };
  const fireflies = createParticles(U, rand, 900, (i) => (i % 3 ? onTerrain(GLADE_CENTER.x, GLADE_CENTER.z, 22, 0.4, 5)() : onTerrain(0, 0, 55, 0.5, 6)()), {
    size: 0.55, colA: '#5ff6e6', colB: '#ffd36b', additive: true, gain: 4,
  });
  const motes = createParticles(U, rand, 420, onTerrain(0, -6, 26, 0.5, 9), {
    size: 0.22, colA: '#ffe2a6', colB: '#ffffff', additive: true, gain: 2.2, drift: 1.6,
  });
  const petals = createParticles(U, rand, 340, onTerrain(GLADE_CENTER.x - 8, GLADE_CENTER.z + 8, 26, 0, 10), {
    size: 0.32, colA: '#ffc3d8', colB: '#ffe9f1', additive: false, gain: 1.0, fall: 0.9,
  });
  // The style test builds 60 spear sparks here; Zeus's spear arrives in M3.
  // Consume the same draws so everything after keeps the reference layout.
  for (let i = 0; i < 60 * 4; i += 1) rand();
  return { fireflies, motes, petals, all: [fireflies, motes, petals] };
}
