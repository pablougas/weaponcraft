import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/**
 * A marble altar with a bronze basin: two weapon cradles on either side and a
 * slowly turning ring of spirit-cyan light above the basin.
 */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const marble = toon({ color: '#e9e3d6' });
  const marbleShade = toon({ color: '#cfc7b6' });
  const bronze = toon({ color: '#b87333' });
  const spirit = toon({ color: '#c6f4ff', emissive: '#4ff0e0', emissiveIntensity: 1.8, rim: false });
  look.glowMaterials.push({ mat: spirit, day: 1.8, night: 3.2 });

  root.add(M(new THREE.CylinderGeometry(1.15, 1.25, 0.22, 10), marbleShade, [0, 0.11, 0], { outline: 0.02 }));
  root.add(M(new THREE.CylinderGeometry(0.95, 1.0, 0.18, 10), marble, [0, 0.31, 0], { outline: 0.02 }));
  root.add(M(new THREE.CylinderGeometry(0.42, 0.55, 0.62, 8), marble, [0, 0.71, 0], { outline: 0.015 }));
  root.add(M(new THREE.CylinderGeometry(0.72, 0.42, 0.22, 12, 1, true), bronze, [0, 1.13, 0], { outline: 0.015 }));
  root.add(M(new THREE.TorusGeometry(0.72, 0.045, 8, 28), bronze, [0, 1.24, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  const pool = M(new THREE.CircleGeometry(0.66, 24), spirit, [0, 1.18, 0], { rot: [-Math.PI / 2, 0, 0], outline: false, cast: false });
  root.add(pool);
  // Weapon cradles either side.
  for (const sx of [-1, 1]) {
    root.add(M(new THREE.BoxGeometry(0.16, 0.9, 0.16), marble, [sx * 1.0, 0.75, 0], { outline: 0.012 }));
    root.add(M(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), bronze, [sx * 1.0, 1.24, 0], { rot: [0, 0, Math.PI], outline: false }));
  }
  const ring = new THREE.Group();
  ring.position.y = 1.75;
  root.add(ring);
  ring.add(M(new THREE.TorusGeometry(0.42, 0.025, 6, 32), spirit, [0, 0, 0], { rot: [Math.PI / 2, 0, 0], outline: false, cast: false }));
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    ring.add(M(new THREE.OctahedronGeometry(0.06), spirit, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], { outline: false, cast: false }));
  }
  const light = new THREE.PointLight('#4ff0e0', 1.2, 6, 2);
  light.position.y = 1.5;
  root.add(light);

  const model: EntityModel = {
    root,
    update(_entity, frame) {
      const speed = frame.reduceMotion ? 0.25 : 0.6;
      ring.rotation.y = frame.time * speed;
      ring.position.y = 1.75 + Math.sin(frame.time * 1.2) * (frame.reduceMotion ? 0.02 : 0.06);
      light.intensity = 1.2 + look.U.night.value * 1.6;
    },
  };
  return model;
};
