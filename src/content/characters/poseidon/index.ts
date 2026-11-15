import type { CharacterDef } from '../index';

/**
 * Poseidon (M7 story, team request Nov 15): he reaches his brothers once the
 * Mk. II is beaten. Story character for now (talk with F). Part of the current
 * milestone (CLAUDE.md exception): the team reviews him in the running game.
 */
export const poseidon: CharacterDef = {
  id: 'poseidon',
  name: 'Poseidon',
  approved: true,
  model: () => import('./model'),
};
