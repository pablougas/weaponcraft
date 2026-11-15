import type { StructureDef } from '../index';

/** A fort's loot chest (M6): opens once every soldier in the fort is down. */
export const chest: StructureDef = {
  id: 'chest',
  name: 'Chest',
  approved: true,
  model: () => import('./model'),
};
