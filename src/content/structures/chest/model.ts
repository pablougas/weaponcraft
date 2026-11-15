import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** A bronze-bound wooden chest; the lid stands open once it's been looted. */
export const createModel: ModelFactory = (look) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const wood = toon({ color: '#6a4a33' });
  const bronze = toon({ color: '#b08a42' });
  root.add(M(new THREE.BoxGeometry(1.1, 0.6, 0.7), wood, [0, 0.3, 0], { outline: 0.015 }));
  for (const x of [-0.42, 0.42]) root.add(M(new THREE.BoxGeometry(0.08, 0.62, 0.72), bronze, [x, 0.31, 0], { outline: false }));
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.35);
  lid.add(M(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI), wood, [0, 0, 0.35], { rot: [0, 0, Math.PI / 2], outline: 0.015 }));
  root.add(lid);
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const fortId = entity.fortId;
      const opened = fortId ? frame.world.forts?.[fortId]?.chestOpened : false;
      lid.rotation.x = opened ? -1.9 : 0;
    },
  };
  return model;
};
