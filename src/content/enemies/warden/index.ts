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
  maxHealth: 1000,
  body: { radius: 0.75, height: 3.5 },
  wanders: false,
  speed: 6.8,
  model: () => import('./model'),
};
