import { FUSIONS, weapons } from '../content/weapons';
import { ARCHETYPES } from '../content/weapons/build';
import { MATERIALS, strongerMaterial } from '../content/weapons/materials';
import { ELEMENT_INFO } from './elements';
import type { AttackNumbers, CodexEntry, Element, PlayerId, WeaponData, WorldState } from './types';

/** A weapon's data: a registry weapon, or one fused in this world. Throws for unknown IDs. */
export function weaponData(world: WorldState | undefined, id: string): WeaponData {
  const def = weapons.find((w) => w.id === id) ?? world?.customWeapons?.[id];
  if (!def) throw new Error(`Unknown weapon "${id}".`);
  return def;
}

export function isKnownWeapon(world: WorldState | undefined, id: string): boolean {
  return weapons.some((w) => w.id === id) || !!world?.customWeapons?.[id];
}

/** The discovery-table key for a pair: the two weapon IDs, sorted (SPEC §8). */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join('+');
}

/** The named result for a pair, if the discovery table has one. */
export function recipeFor(a: string, b: string): string | undefined {
  const key = pairKey(a, b);
  return FUSIONS.find((r) => pairKey(r.a, r.b) === key)?.result;
}

/** Fallback stats: average of the two, +10% damage; timing comes from A's shape. */
function averaged(a: AttackNumbers, b: AttackNumbers): AttackNumbers {
  return {
    ...a,
    damage: Math.round(((a.damage + b.damage) / 2) * 1.1),
    range: Math.round(((a.range + b.range) / 2) * 10) / 10,
    arcDeg: Math.round((a.arcDeg + b.arcDeg) / 2),
    staminaCost: Math.round((a.staminaCost + b.staminaCost) / 2),
  };
}

/**
 * The generic fused weapon for an unknown pair (SPEC §8 fallback rule):
 * shape of A, stats averaged + 10%, and the fusing god's element (Zeus →
 * Lightning; B's element if no god is given). It keeps A's handle and head
 * and takes B's guard, so the fusion shows on the model, and uses the
 * stronger material. Deterministic: the same A, B and element always give the same weapon.
 */
export function genericFusion(a: WeaponData, b: WeaponData, element: Element | null = b.element): WeaponData {
  const prefix = element ? `${ELEMENT_INFO[element].name}-touched` : 'Reforged';
  const guard = b.parts.guard !== 'none' ? b.parts.guard : a.parts.guard;
  return {
    id: `fused:${a.id}|${b.id}${element ? `@${element}` : ''}`,
    name: `${prefix} ${a.name}`,
    archetype: a.archetype,
    parts: { ...a.parts, guard },
    material: strongerMaterial(a.material, b.material),
    element,
    light: averaged(a.light, b.light),
    heavy: averaged(a.heavy, b.heavy),
    legendary: false,
    description: `${a.name} reforged with ${b.name}. ${ARCHETYPES[a.archetype].name}, ${MATERIALS[strongerMaterial(a.material, b.material)].name}.`,
    fusedFrom: [a.id, b.id],
  };
}

export interface FusionResult {
  weapon: WeaponData;
  key: string;
  legendary: boolean;
  /** True if this pair hadn't been fused in this world before. */
  newDiscovery: boolean;
}

/**
 * Fuses weapon A with weapon B (both IDs): looks up the discovery table, or
 * makes the fallback weapon; records it in the world's codex (and stores
 * created weapons so they save). Does not touch inventories.
 *
 * `element` is the fusing god's power: the result keeps it (team decision,
 * M4: Zeus's fused weapons stay Lightning). A named legendary of another
 * element becomes a variant of it in that element (e.g. `dawnbringer@lightning`).
 */
export function fuse(world: WorldState, aId: string, bId: string, by: PlayerId, element: Element | null = null): FusionResult {
  const named = recipeFor(aId, bId);
  let weapon: WeaponData;
  if (named) {
    weapon = weaponData(world, named);
    if (element && weapon.element !== element) {
      const variant: WeaponData = {
        ...weapon,
        id: `${weapon.id}@${element}`,
        element,
        description: `${weapon.description} Fused by a god of ${ELEMENT_INFO[element].name.toLowerCase()}, it carries their power.`,
      };
      world.customWeapons[variant.id] ??= variant;
      weapon = variant;
    }
  } else {
    weapon = genericFusion(weaponData(world, aId), weaponData(world, bId), element ?? weaponData(world, bId).element);
    world.customWeapons[weapon.id] ??= weapon;
  }
  const key = named ? pairKey(aId, bId) : weapon.id;
  const newDiscovery = !world.codex[key];
  if (newDiscovery) {
    const entry: CodexEntry = { resultId: weapon.id, legendary: weapon.legendary, inputs: [aId, bId], discoveredTick: world.tick, by };
    world.codex[key] = entry;
  }
  return { weapon, key, legendary: weapon.legendary, newDiscovery };
}
