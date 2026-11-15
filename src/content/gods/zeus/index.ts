import type { GodDef } from '../../types';
import { boltStep } from './bolt-step';
import { chainLightning } from './chain-lightning';
import { lightningFist } from './lightning-fist';
import { skyStrike } from './sky-strike';

/** Zeus, the first playable god (SPEC §5). Model matches the style-test placeholder. */
export const zeus: GodDef = {
  id: 'zeus',
  name: 'Zeus',
  element: 'lightning',
  // Part of the current milestone and shown to the team in the running game (CLAUDE.md exception).
  approved: true,
  maxHealth: 100,
  maxStamina: 100,
  // ~25% faster (team request, Nov 15).
  walkSpeed: 5.8,
  sprintSpeed: 10,
  jumpSpeed: 7.6,
  hoverTicks: 21,
  body: { radius: 0.32, height: 1.9 },
  ability: chainLightning,
  blink: boltStep,
  chargedMove: lightningFist,
  ultimate: skyStrike,
  starterWeaponId: 'starter-spear',
  model: () => import('./model'),
};
