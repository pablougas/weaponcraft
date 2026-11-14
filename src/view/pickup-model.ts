import * as THREE from 'three';
import { ELEMENT_INFO } from '../sim/elements';
import { isKnownWeapon, weaponData } from '../sim/weapons';
import type { EntityModel, ModelFactory } from './entity-model';
import { buildWeaponModel } from './weapon-model';

/**
 * A weapon lying in the meadow: it floats and turns slowly above a soft ring
 * of light in its element's colour, with a faint beam so it's findable from afar.
 */
export const createPickupModel: ModelFactory = (look) => {
  const root = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = 1.0;
  root.add(holder);
  let built = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.55, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.6, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  root.add(ring);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 6, 12, 1, true), beamMat);
  beam.position.y = 3;
  root.add(beam);

  const model: EntityModel = {
    root,
    update(entity, frame) {
      const weaponId = entity.pickup?.weaponId;
      if (!built && weaponId && isKnownWeapon(frame.world, weaponId)) {
        built = true;
        const weapon = weaponData(frame.world, weaponId);
        const { group } = buildWeaponModel(look, weapon);
        group.rotation.z = 0.35;
        holder.add(group);
        const color = weapon.element ? ELEMENT_INFO[weapon.element].color : '#ffe6a6';
        ringMat.color.set(color);
        beamMat.color.set(color);
      }
      const motion = frame.reduceMotion ? 0.3 : 1;
      holder.rotation.y = frame.time * 0.8 * motion;
      holder.position.y = 1.0 + Math.sin(frame.time * 1.6) * 0.08 * motion;
    },
  };
  return model;
};
