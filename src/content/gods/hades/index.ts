import type { GodDef } from '../../types';
import { graspOfTheDead } from './grasp-of-the-dead';
import { shadowStep } from './shadow-step';
import { skullCage } from './skull-cage';
import { soulBolts } from './soul-bolts';

/**
 * Hades (SPEC §5; approved concept `docs/reference/hades-concept.html`): as
 * powerful as Zeus on the same keys, but closer in, controlling crowds and
 * stealing life. The team approved the in-game model on Nov 14.
 */
export const hades: GodDef = {
  id: 'hades',
  name: 'Hades',
  element: 'shadow',
  approved: true,
  maxHealth: 110,
  maxStamina: 100,
  walkSpeed: 4.4,
  sprintSpeed: 7.8,
  jumpSpeed: 7.2,
  hoverTicks: 12,
  body: { radius: 0.36, height: 2.1 },
  ability: soulBolts,
  blink: shadowStep,
  chargedMove: graspOfTheDead,
  ultimate: skullCage,
  // Lord of the Dead: stronger underground (and at night on the surface).
  passive: { id: 'lord-of-the-dead', name: 'Lord of the Dead', damageMultiplier: 1.15, staminaRegenMultiplier: 1.25, when: 'underworld-or-night' },
  starterWeaponId: 'shadow-bident',
  model: () => import('./model'),
};

/** Kept for the characters preview and older imports. */
export const hadesLook = hades;
