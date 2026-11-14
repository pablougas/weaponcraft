import * as THREE from 'three';
import { MATERIALS } from '../content/weapons/materials';
import { ELEMENT_INFO } from '../sim/elements';
import type { WeaponData } from '../sim/types';
import type { Look } from './look';

export interface WeaponModel {
  group: THREE.Group;
  /** The striking end, for effects (Chain Lightning leaves from here). */
  tip: THREE.Object3D;
}

/**
 * Builds a weapon from primitives (SPEC §8): handle + head + guard in its
 * material, with the element as a glowing accent. The grip sits at the
 * origin and the weapon points up +Y, so a hand can hold any of them the
 * same way. Fused weapons show their mixed parts.
 */
export function buildWeaponModel(look: Look, weapon: WeaponData): WeaponModel {
  const { M, toon } = look;
  const group = new THREE.Group();
  const material = MATERIALS[weapon.material];
  const divine = weapon.material === 'divine-ore';
  const metal = toon({ color: material.color, ...(divine ? { emissive: '#ffcf6b', emissiveIntensity: 0.35 } : {}) });
  const trim = toon({ color: material.accent });
  const wrap = toon({ color: weapon.material === 'wood' ? '#5d4128' : '#6a4a33' });
  const elementColor = weapon.element ? ELEMENT_INFO[weapon.element].color : null;
  const glow = elementColor
    ? toon({ color: elementColor, emissive: elementColor, emissiveIntensity: weapon.legendary ? 2.4 : 1.6, rim: false })
    : trim;
  if (elementColor) look.glowMaterials.push({ mat: glow as THREE.MeshToonMaterial, day: weapon.legendary ? 2.4 : 1.6, night: weapon.legendary ? 2.8 : 2.0 });

  // Handle: where it ends decides where the head goes.
  let top: number;
  if (weapon.parts.handle === 'grip') {
    group.add(M(new THREE.CylinderGeometry(0.03, 0.032, 0.32, 8), wrap, [0, 0, 0], { outline: 0.006 }));
    group.add(M(new THREE.SphereGeometry(0.045, 10, 8), trim, [0, -0.19, 0], { outline: false }));
    top = 0.16;
  } else {
    const length = weapon.parts.handle === 'pole' ? 1.9 : 2.1;
    const bottom = -0.65;
    group.add(M(new THREE.CylinderGeometry(0.024, 0.026, length, 8), weapon.archetype === 'staff' ? wrap : metal, [0, bottom + length / 2, 0], { outline: 0.008 }));
    group.add(M(new THREE.CylinderGeometry(0.034, 0.03, 0.08, 8), trim, [0, bottom, 0], { outline: false }));
    top = bottom + length;
  }

  // Guard sits where the handle meets the head.
  switch (weapon.parts.guard) {
    case 'crossguard':
      group.add(M(new THREE.BoxGeometry(0.26, 0.04, 0.05), trim, [0, top + 0.02, 0], { outline: 0.006 }));
      break;
    case 'ring':
      group.add(M(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 8), trim, [0, top - 0.02, 0], { outline: 0.006 }));
      break;
    case 'wings':
      for (const sx of [-1, 1]) {
        group.add(M(new THREE.ConeGeometry(0.05, 0.22, 4), trim, [sx * 0.1, top + 0.03, 0], { rot: [0, 0, sx * 1.1], outline: 0.006 }));
      }
      break;
    default:
  }

  // Head.
  const tip = new THREE.Object3D();
  switch (weapon.parts.head) {
    case 'spearhead':
      group.add(M(new THREE.ConeGeometry(0.06, 0.32, 6), metal, [0, top + 0.16, 0], { outline: 0.008 }));
      if (elementColor) group.add(M(new THREE.ConeGeometry(0.035, 0.12, 6), glow, [0, top + 0.3, 0], { outline: false, cast: false }));
      tip.position.set(0, top + 0.36, 0);
      break;
    case 'thunder-tip': {
      for (const [x, y, rz] of [[0, 0.17, 0.5], [0.06, 0.39, -0.6], [0, 0.59, 0.55]]) {
        group.add(M(new THREE.BoxGeometry(0.07, 0.3, 0.05), glow, [x, top + y, 0], { rot: [0, 0, rz], outline: false, cast: false }));
      }
      group.add(M(new THREE.ConeGeometry(0.06, 0.18, 6), glow, [-0.03, top + 0.8, 0], { rot: [0, 0, 0.3], outline: false }));
      tip.position.set(0, top + 0.4, 0);
      break;
    }
    case 'blade':
      group.add(M(new THREE.BoxGeometry(0.09, 0.82, 0.018), metal, [0, top + 0.43, 0], { outline: 0.006 }));
      group.add(M(new THREE.ConeGeometry(0.064, 0.14, 4), metal, [0, top + 0.91, 0], { rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.28], outline: 0.006 }));
      if (elementColor) group.add(M(new THREE.BoxGeometry(0.02, 0.7, 0.022), glow, [0, top + 0.42, 0], { outline: false, cast: false }));
      tip.position.set(0, top + 0.95, 0);
      break;
    case 'axe-head': {
      const blade = new THREE.Shape([
        new THREE.Vector2(0, -0.08), new THREE.Vector2(0.2, -0.17), new THREE.Vector2(0.26, 0),
        new THREE.Vector2(0.2, 0.17), new THREE.Vector2(0, 0.08),
      ]);
      const geometry = new THREE.ExtrudeGeometry(blade, { depth: 0.03, bevelEnabled: false });
      geometry.translate(0, 0, -0.015);
      group.add(M(geometry, metal, [0.02, top - 0.12, 0], { outline: 0.006 }));
      group.add(M(new THREE.BoxGeometry(0.06, 0.12, 0.06), trim, [0, top - 0.12, 0], { outline: 0.006 }));
      if (elementColor) group.add(M(new THREE.BoxGeometry(0.02, 0.3, 0.034), glow, [0.27, top - 0.12, 0], { outline: false, cast: false }));
      tip.position.set(0.24, top - 0.12, 0);
      break;
    }
    case 'orb':
      group.add(M(new THREE.TorusGeometry(0.1, 0.018, 6, 16), trim, [0, top + 0.1, 0], { outline: false }));
      group.add(M(new THREE.SphereGeometry(0.075, 14, 10), elementColor ? glow : metal, [0, top + 0.1, 0], { outline: elementColor ? false : 0.006 }));
      tip.position.set(0, top + 0.1, 0);
      break;
    case 'crescent':
      group.add(M(new THREE.TorusGeometry(0.15, 0.022, 6, 18, Math.PI * 1.3), metal, [0, top + 0.12, 0], { rot: [0, 0, -0.5], outline: 0.006 }));
      group.add(M(new THREE.SphereGeometry(0.04, 10, 8), elementColor ? glow : trim, [0, top + 0.12, 0], { outline: false }));
      tip.position.set(0, top + 0.12, 0);
      break;
    default:
  }
  group.add(tip);
  return { group, tip };
}
