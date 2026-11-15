import type { EnemyDef } from '../../types';

/**
 * The Warden (M7 boss): Cerberus Mk. II's pilot. Behaviour in
 * sim/systems/warden.ts. Part of the current milestone (CLAUDE.md
 * exception): the team reviews him in the running game.
 */
export const theWarden: EnemyDef = {
  id: 'the-warden',
  name: 'The Warden',
  approved: true,
  maxHealth: 1600,
  body: { radius: 1, height: 4.5 },
  wanders: false,
  speed: 7.6,
  model: () => import('./model'),
};
