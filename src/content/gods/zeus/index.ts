import type { GodDef } from '../../types';
import { chainLightning } from './chain-lightning';

/** Zeus, the first playable god (SPEC §5). Model matches the style-test placeholder. */
export const zeus: GodDef = {
  id: 'zeus',
  name: 'Zeus',
  // Part of the current milestone and shown to the team in the running game (CLAUDE.md exception).
  approved: true,
  maxHealth: 100,
  maxStamina: 100,
  walkSpeed: 4.6,
  sprintSpeed: 8,
  jumpSpeed: 7.6,
  hoverTicks: 21,
  body: { radius: 0.32, height: 1.9 },
  ability: chainLightning,
  starterWeaponId: 'starter-spear',
  model: () => import('./model'),
};
