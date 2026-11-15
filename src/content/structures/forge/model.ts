import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** A stone furnace with a chimney and a cold hearth, and an anvil beside it. */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const stone = toon({ color: '#7d7680' });
  const dark = toon({ color: '#2a2630' });
  const iron = toon({ color: '#4a4c58' });
  const ember = toon({ color: '#7a3a22', emissive: '#c4581e', emissiveIntensity: 0.6, rim: false });
  root.add(M(new THREE.BoxGeometry(1.6, 1.1, 1.3), stone, [0, 0.55, 0], { outline: 0.02 }));
  root.add(M(new THREE.BoxGeometry(0.8, 0.5, 0.2), dark, [0, 0.55, 0.62], { outline: false }));
  root.add(M(new THREE.BoxGeometry(0.6, 0.12, 0.12), ember, [0, 0.36, 0.66], { outline: false, cast: false }));
  root.add(M(new THREE.CylinderGeometry(0.28, 0.36, 1.4, 8), stone, [0.35, 1.8, -0.25], { outline: 0.015 }));
  root.add(M(new THREE.BoxGeometry(0.55, 0.32, 0.26), iron, [-1.3, 0.62, 0.35], { outline: 0.01 }));
  root.add(M(new THREE.CylinderGeometry(0.14, 0.2, 0.45, 8), iron, [-1.3, 0.24, 0.35], { outline: 0.01 }));
  const model: EntityModel = { root, update() {} };
  return model;
};
