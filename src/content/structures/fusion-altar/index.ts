import type { StructureDef } from '../index';

/** The Fusion Altar in the meadow (F to use): combine two weapons (SPEC §8). */
export const fusionAltar: StructureDef = {
  id: 'fusion-altar',
  name: 'Fusion Altar',
  // Part of M4 and signed off through the altar screenshots (CLAUDE.md exception).
  approved: true,
  model: () => import('./model'),
};
