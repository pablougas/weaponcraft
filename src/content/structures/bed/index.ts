import type { StructureDef } from '../index';

/** A bed to rest at (F): restores health and stamina; the world clock keeps running (SPEC §6). */
export const bed: StructureDef = {
  id: 'bed',
  name: 'Bed',
  // Part of the M5/M5.1 Refuge; signed off through the grotto screenshots (CLAUDE.md exception).
  approved: true,
  model: () => import('./model'),
};
