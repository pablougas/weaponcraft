import type { BlinkMove } from '../../../sim/abilities';
import { ticks } from '../../../sim/constants';

/**
 * Hades's W: he melts into shadow and reappears up to 8 m away, or *behind*
 * his lock-on target within 12 m, untouchable for 0.25 s. He leaves a shadow
 * decoy for 2 s that enemies chase, and his next attack within 1 s deals +50%.
 */
export const shadowStep: BlinkMove = {
  id: 'shadow-step',
  name: 'Shadow Step',
  element: 'shadow',
  range: 8,
  lockRange: 12,
  staminaCost: 12,
  cooldownTicks: ticks(1.2),
  iframeTicks: ticks(0.25),
  burstRadius: 0,
  burstDamage: 0,
  behindTarget: true,
  decoyTicks: ticks(2),
  ambush: { ticks: ticks(1), multiplier: 1.5 },
};
