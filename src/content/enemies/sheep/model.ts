import * as THREE from 'three';
import type { EntityModel, ModelFactory } from '../../../view/entity-model';

/** A round, fluffy meadow sheep. Trots when it moves, hops when hit. */
export const createModel: ModelFactory = (look, entityId) => {
  const { M, toon } = look;
  const root = new THREE.Group();
  const body = new THREE.Group();
  // Built at 1 m tall, then scaled up so it stands out of the meadow's tall grass.
  body.scale.setScalar(1.4);
  root.add(body);
  const wool = toon({ color: '#f4f0e6' });
  const skin = toon({ color: '#3b3540' });
  const inner = toon({ color: '#d99a9a', rim: false });

  const puffs: Array<[number, number, number, number]> = [
    [0, 0.62, 0, 0.36], [0, 0.66, 0.22, 0.3], [0, 0.64, -0.24, 0.3],
    [0.17, 0.6, 0.05, 0.26], [-0.17, 0.6, 0.05, 0.26], [0, 0.82, 0.02, 0.24],
  ];
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  for (const [x, y, z, r] of puffs) body.add(M(puffGeo, wool, [x, y, z], { scale: [r, r * 0.9, r], outline: 0.03 }));

  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.45);
  body.add(head);
  head.add(M(new THREE.SphereGeometry(0.15, 14, 10), skin, [0, 0, 0.04], { scale: [0.9, 1, 1.25], outline: 0.012 }));
  head.add(M(new THREE.IcosahedronGeometry(0.12, 1), wool, [0, 0.12, -0.02], { outline: 0.01 }));
  for (const sx of [-1, 1]) {
    head.add(M(new THREE.SphereGeometry(0.07, 10, 8), skin, [sx * 0.16, 0.04, -0.02], { scale: [1.4, 0.45, 0.8], rot: [0, 0, sx * -0.4], outline: 0.008 }));
    head.add(M(new THREE.SphereGeometry(0.035, 8, 6), inner, [sx * 0.165, 0.045, 0.0], { scale: [1.2, 0.3, 0.6], rot: [0, 0, sx * -0.4], outline: false, cast: false }));
    head.add(M(new THREE.SphereGeometry(0.022, 8, 6), toon({ color: '#101018', rim: false }), [sx * 0.07, 0.05, 0.16], { outline: false, cast: false }));
  }

  const legs: THREE.Group[] = [];
  for (const [x, z] of [[0.13, 0.2], [-0.13, 0.2], [0.13, -0.2], [-0.13, -0.2]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.42, z);
    leg.add(M(new THREE.CylinderGeometry(0.04, 0.035, 0.42, 8), skin, [0, -0.21, 0], { outline: 0.008 }));
    body.add(leg);
    legs.push(leg);
  }

  const last = new THREE.Vector3(Number.NaN, 0, 0);
  let phase = 0;
  let hop = 0;
  const model: EntityModel = {
    root,
    update(entity, frame) {
      const p = entity.position;
      const speed = Number.isNaN(last.x) || frame.dt <= 0 ? 0 : Math.hypot(p.x - last.x, p.z - last.z) / frame.dt;
      last.set(p.x, p.y, p.z);
      const moving = speed > 0.2;
      phase += frame.dt * (moving ? 6 + speed * 2.5 : 0);
      const swing = moving ? Math.sin(phase) * 0.5 : 0;
      legs[0].rotation.x = swing;
      legs[3].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[2].rotation.x = -swing;
      hop = Math.max(0, hop - frame.dt * 2.5);
      const hopAmount = frame.reduceMotion ? 0.4 : 1;
      body.position.y = 1.4 * (moving ? Math.abs(Math.sin(phase)) * 0.04 : 0) + Math.sin(hop * Math.PI) * 0.35 * hopAmount;
      // Grazing: the head dips now and then while standing.
      head.rotation.x = moving ? 0 : Math.max(0, Math.sin(frame.time * 0.7 + p.x)) * 0.6;
    },
    onEvent(event) {
      if (event.type === 'combat:hit' && event.targetId === entityId) hop = 1;
    },
  };
  return model;
};
