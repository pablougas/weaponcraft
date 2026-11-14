import { biomes } from './biomes';
import { enemies } from './enemies';
import { gods } from './gods';
import { mechs } from './mechs';
import { spirits } from './spirits';
import { structures } from './structures';
import type { ContentDef } from './types';
import { weapons } from './weapons';

/** Every content registry by type name (the `<type>` in `?preview=<type>`). */
export const registries: Readonly<Record<string, readonly ContentDef[]>> = {
  biomes,
  gods,
  spirits,
  weapons,
  enemies,
  mechs,
  structures,
};

/** Content allowed in normal play (approved only). */
export function playable<T extends ContentDef>(registry: readonly T[]): T[] {
  return registry.filter((def) => def.approved);
}
