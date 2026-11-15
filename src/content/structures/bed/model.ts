import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** A low wooden bed with a straw mattress, a wool blanket and a pillow. */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const wood = toon({ color: '#6a4a33' });
  const straw = toon({ color: '#d8c79a' });
  const wool = toon({ color: '#7a3b4a' });
  const linen = toon({ color: '#efe8da' });
  root.add(M(new THREE.BoxGeometry(1.1, 0.28, 2.1), wood, [0, 0.24, 0], { outline: 0.015 }));
  for (const [x, z] of [[-0.5, -0.98], [0.5, -0.98], [-0.5, 0.98], [0.5, 0.98]]) {
    root.add(M(new THREE.BoxGeometry(0.1, 0.42, 0.1), wood, [x, 0.21, z], { outline: 0.01 }));
  }
  root.add(M(new THREE.BoxGeometry(1.14, 0.55, 0.1), wood, [0, 0.45, -1.02], { outline: 0.012 }));
  root.add(M(new THREE.BoxGeometry(1.0, 0.16, 1.95), straw, [0, 0.46, 0.02], { outline: 0.012 }));
  root.add(M(new THREE.BoxGeometry(1.04, 0.08, 1.25), wool, [0, 0.57, 0.36], { outline: 0.01 }));
  root.add(M(new THREE.CapsuleGeometry(0.13, 0.5, 4, 8), linen, [0, 0.62, -0.72], { rot: [0, 0, Math.PI / 2], outline: 0.01 }));
  // Sized for a god (Zeus stands about 2.2 m tall).
  root.scale.setScalar(1.6);
  const model: EntityModel = { root, update() {} };
  return model;
};
