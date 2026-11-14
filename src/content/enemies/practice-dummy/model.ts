import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** A straw dummy on a wooden post, with a painted target. Wobbles when hit and slumps at zero health. */
export const createModel: ModelFactory = (look, entityId) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const wood = toon({ color: '#7a5636' });
  const straw = toon({ color: '#d9b45a' });
  const sack = toon({ color: '#cfa86a' });
  const rope = toon({ color: '#8c6b42' });
  const paint = toon({ color: '#b8442e', rim: false });

  root.add(M(new THREE.CylinderGeometry(0.33, 0.4, 0.12, 10), wood, [0, 0.06, 0]));
  // The upper body pivots at the base of the post so hits rock it.
  const pivot = new THREE.Group();
  pivot.position.y = 0.12;
  root.add(pivot);
  pivot.add(M(new THREE.CylinderGeometry(0.06, 0.07, 1.65, 8), wood, [0, 0.82, 0], { outline: 0.012 }));
  pivot.add(M(new THREE.CylinderGeometry(0.27, 0.23, 0.7, 12), straw, [0, 1.05, 0], { outline: 0.015 }));
  pivot.add(M(new THREE.TorusGeometry(0.255, 0.022, 6, 18), rope, [0, 1.25, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  pivot.add(M(new THREE.TorusGeometry(0.245, 0.022, 6, 18), rope, [0, 0.86, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
  pivot.add(M(new THREE.CircleGeometry(0.12, 18), paint, [0, 1.06, 0.272], { outline: false, cast: false }));
  pivot.add(M(new THREE.BoxGeometry(1.0, 0.07, 0.07), wood, [0, 1.3, 0], { outline: 0.012 }));
  for (const sx of [-1, 1]) pivot.add(M(new THREE.SphereGeometry(0.09, 10, 8), straw, [sx * 0.52, 1.3, 0]));
  pivot.add(M(new THREE.SphereGeometry(0.2, 16, 12), sack, [0, 1.6, 0], { scale: [1, 1.08, 1], outline: 0.012 }));
  pivot.add(M(new THREE.ConeGeometry(0.07, 0.14, 8), rope, [0, 1.8, 0], { outline: false }));

  let wobble = 0;
  let slump = 0;
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const down = (entity.health?.current ?? 1) <= 0;
      slump += ((down ? 1 : 0) - slump) * Math.min(1, frame.dt * 6);
      wobble = Math.max(0, wobble - frame.dt * 1.8);
      const amount = frame.reduceMotion ? 0.35 : 1;
      pivot.rotation.x = -slump * 1.1 + Math.sin(frame.time * 17) * 0.22 * wobble * amount;
      pivot.rotation.z = Math.sin(frame.time * 13) * 0.12 * wobble * amount;
    },
    onEvent(event) {
      if (event.type === 'combat:hit' && event.targetId === entityId) wobble = Math.min(1, wobble + 0.8);
    },
  };
  return model;
};
