import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/**
 * An arch of sea-worn Atlantean marble, crusted with coral and gold, around
 * a standing disc of swirling seawater. The swirl drifts slowly (slower with
 * reduce motion); nothing flashes.
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const marble = toon({ color: '#d9e4e6' });
  const marbleDark = toon({ color: '#9fb6bd' });
  const gold = toon({ color: '#d8b04a', emissive: '#5a3f08', emissiveIntensity: 0.25 });
  const coral = toon({ color: '#e0705f' });
  const coralB = toon({ color: '#b84d7a' });

  // Two fluted pillars on stepped bases, and the arch between them.
  for (const side of [-1, 1]) {
    root.add(M(new THREE.BoxGeometry(1.1, 0.35, 1.1), marbleDark, [side * 1.75, 0.17, 0], { outline: 0.012 }));
    root.add(M(new THREE.CylinderGeometry(0.34, 0.4, 3.4, 10), marble, [side * 1.75, 2.0, 0], { outline: 0.012 }));
    root.add(M(new THREE.TorusGeometry(0.4, 0.06, 6, 14), gold, [side * 1.75, 3.62, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
    // Coral climbing the pillar.
    for (let k = 0; k < 3; k += 1) {
      const y = 0.6 + k * 0.7;
      root.add(M(new THREE.ConeGeometry(0.1, 0.45, 5), k % 2 ? coral : coralB, [side * (1.75 + 0.33), y, 0.12 - k * 0.1], { rot: [0.3, 0, side * -0.6], outline: 0.006 }));
    }
  }
  const arch = new THREE.TorusGeometry(1.75, 0.3, 8, 24, Math.PI);
  root.add(M(arch, marble, [0, 3.7, 0], { outline: 0.012 }));
  root.add(M(new THREE.TorusGeometry(1.75, 0.08, 6, 24, Math.PI), gold, [0, 3.7, 0.3], { outline: false }));
  // A trident crest at the top.
  root.add(M(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), gold, [0, 5.75, 0], { outline: 0.006 }));
  for (const x of [-0.22, 0, 0.22]) root.add(M(new THREE.ConeGeometry(0.06, 0.28, 5), gold, [x, x === 0 ? 6.32 : 6.2, 0], { outline: 0.005 }));
  root.add(M(new THREE.BoxGeometry(0.5, 0.06, 0.08), gold, [0, 6.05, 0], { outline: false }));

  // The water: a standing disc of swirling sea.
  const water = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float time; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.0); float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float swirl = sin(a * 4.0 + r * 8.0 - time * 1.2) * 0.5 + 0.5;
        float foam = smoothstep(0.82, 0.98, sin(a * 9.0 - r * 14.0 + time * 0.8) * 0.5 + 0.5) * smoothstep(0.2, 0.9, r);
        vec3 deep = vec3(0.02, 0.16, 0.3);
        vec3 shallow = vec3(0.12, 0.62, 0.72);
        vec3 col = mix(deep, shallow, swirl * (0.35 + r * 0.6)) + foam * vec3(0.55, 0.8, 0.85) * 0.5;
        col += vec3(0.5, 0.95, 1.0) * smoothstep(0.86, 1.0, r) * 0.45;
        gl_FragColor = vec4(col, smoothstep(1.0, 0.94, r) * 0.92);
      }`,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), water);
  disc.scale.set(1, 1.55, 1);
  disc.position.y = 2.25;
  root.add(disc);

  const model: EntityModel = {
    root,
    update(_entity, frame) {
      // Drifts with the view clock (frozen in tests), gentler with reduce motion.
      water.uniforms.time.value = frame.time * (frame.reduceMotion ? 0.4 : 1);
    },
    dispose() {
      water.dispose();
    },
  };
  return model;
};
