import type { StructureDef } from '../index';

/** The Forge (F): crafting from gathered materials arrives with the wider world (M6+). */
export const forge: StructureDef = {
  id: 'forge',
  name: 'Forge',
  approved: true,
  model: () => import('./model'),
};
