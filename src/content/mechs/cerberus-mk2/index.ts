import type { MechDef } from '../index';

/**
 * Cerberus Mk. II (M7): the three-headed brass-and-iron war machine at the
 * Gates, powered by the chained hound. Part of the current milestone
 * (CLAUDE.md exception): the team reviews it in the running game.
 */
export const cerberusMk2: MechDef = {
  id: 'cerberus-mk2',
  name: 'Cerberus Mk. II',
  approved: true,
  model: () => import('./model'),
};
