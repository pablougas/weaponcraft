import { enemies } from '../content/enemies';
import { gods } from '../content/gods';
import type { EnemyDef, GodDef, WeaponDef } from '../content/types';
import { weapons } from '../content/weapons';

/** Looks up content definitions by ID. Throws for unknown IDs (a content bug). */
function lookup<T extends { id: string }>(registry: readonly T[], kind: string, id: string): T {
  const def = registry.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown ${kind} "${id}".`);
  return def;
}

export const godDef = (id: string): GodDef => lookup(gods, 'god', id);
export const enemyDef = (id: string): EnemyDef => lookup(enemies, 'enemy', id);
export const weaponDef = (id: string): WeaponDef => lookup(weapons, 'weapon', id);

/** True if `id` is a registered god, for entities that may be gods. */
export const isGod = (id: string): boolean => gods.some((d) => d.id === id);
