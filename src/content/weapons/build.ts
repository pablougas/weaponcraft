import { ticks } from '../../sim/constants';
import type { AttackNumbers, Element, MaterialId, WeaponArchetype, WeaponParts } from '../../sim/types';
import type { WeaponDef } from '../types';
import { MATERIALS } from './materials';

/** Light/heavy attack numbers per archetype at Bronze (power 1). */
export const ARCHETYPES: Readonly<Record<WeaponArchetype, { name: string; light: AttackNumbers; heavy: AttackNumbers; parts: WeaponParts }>> = {
  // Quick thrust that reaches; wide overhead sweep.
  spear: {
    name: 'Spear',
    light: { damage: 10, range: 2.6, arcDeg: 70, hitTick: 5, totalTicks: ticks(0.4), staminaCost: 6, cleave: false, lunge: 2.5 },
    heavy: { damage: 24, range: 3.1, arcDeg: 150, hitTick: 13, totalTicks: ticks(0.85), staminaCost: 18, cleave: true, lunge: 1.2 },
    parts: { handle: 'shaft', head: 'spearhead', guard: 'ring' },
  },
  // Balanced slashes.
  sword: {
    name: 'Sword',
    light: { damage: 12, range: 2.1, arcDeg: 100, hitTick: 4, totalTicks: ticks(0.36), staminaCost: 6, cleave: false, lunge: 2 },
    heavy: { damage: 26, range: 2.4, arcDeg: 170, hitTick: 11, totalTicks: ticks(0.75), staminaCost: 16, cleave: true, lunge: 1.4 },
    parts: { handle: 'grip', head: 'blade', guard: 'crossguard' },
  },
  // Slow and heavy.
  axe: {
    name: 'Axe',
    light: { damage: 14, range: 2.0, arcDeg: 90, hitTick: 7, totalTicks: ticks(0.55), staminaCost: 8, cleave: false, lunge: 1.6 },
    heavy: { damage: 34, range: 2.4, arcDeg: 180, hitTick: 16, totalTicks: ticks(1.0), staminaCost: 22, cleave: true, lunge: 1 },
    parts: { handle: 'shaft', head: 'axe-head', guard: 'none' },
  },
  // Long reach, wide arcs, lighter hits.
  staff: {
    name: 'Staff',
    light: { damage: 9, range: 2.9, arcDeg: 120, hitTick: 6, totalTicks: ticks(0.47), staminaCost: 5, cleave: true, lunge: 1.4 },
    heavy: { damage: 20, range: 3.4, arcDeg: 220, hitTick: 14, totalTicks: ticks(0.85), staminaCost: 16, cleave: true, lunge: 0.8 },
    parts: { handle: 'pole', head: 'orb', guard: 'none' },
  },
};

/** Legendaries hit a little harder than their material alone. */
const LEGENDARY_BONUS = 1.15;

function scale(numbers: AttackNumbers, factor: number): AttackNumbers {
  return { ...numbers, damage: Math.round(numbers.damage * factor) };
}

export interface WeaponRecipe {
  id: string;
  name: string;
  archetype: WeaponArchetype;
  material: MaterialId;
  element: Element | null;
  description: string;
  approved: boolean;
  legendary?: boolean;
  /** Overrides the archetype's default parts (legendaries mix parts). */
  parts?: Partial<WeaponParts>;
}

/** Builds a weapon def from archetype × material × element (SPEC §8). */
export function makeWeapon(recipe: WeaponRecipe): WeaponDef {
  const base = ARCHETYPES[recipe.archetype];
  const factor = MATERIALS[recipe.material].power * (recipe.legendary ? LEGENDARY_BONUS : 1);
  return {
    id: recipe.id,
    name: recipe.name,
    approved: recipe.approved,
    archetype: recipe.archetype,
    parts: { ...base.parts, ...recipe.parts },
    material: recipe.material,
    element: recipe.element,
    light: scale(base.light, factor),
    heavy: scale(base.heavy, factor),
    legendary: !!recipe.legendary,
    description: recipe.description,
  };
}
