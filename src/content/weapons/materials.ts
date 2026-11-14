import type { MaterialId } from '../../sim/types';

/**
 * Weapon materials, weakest to strongest (SPEC §8: wood → bronze → storm iron
 * → mech parts → divine ore). `power` scales damage; colours are for models
 * and icons.
 */
export const MATERIALS: Readonly<Record<MaterialId, { name: string; tier: number; power: number; color: string; accent: string }>> = {
  wood: { name: 'Oak', tier: 0, power: 0.8, color: '#8a6a45', accent: '#c9a77a' },
  bronze: { name: 'Bronze', tier: 1, power: 1.0, color: '#b87333', accent: '#e7b443' },
  'storm-iron': { name: 'Storm Iron', tier: 2, power: 1.2, color: '#6f7f96', accent: '#b9c8de' },
  'mech-brass': { name: 'Mech Brass', tier: 3, power: 1.35, color: '#a8863a', accent: '#d9b85c' },
  'divine-ore': { name: 'Divine Ore', tier: 4, power: 1.6, color: '#efe2b8', accent: '#ffd36b' },
};

/** The stronger of two materials (fusions keep the better one). */
export function strongerMaterial(a: MaterialId, b: MaterialId): MaterialId {
  return MATERIALS[a].tier >= MATERIALS[b].tier ? a : b;
}
