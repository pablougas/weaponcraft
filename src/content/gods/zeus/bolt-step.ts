import type { BlinkMove } from '../../../sim/abilities';
import { ticks } from '../../../sim/constants';

/**
 * Zeus's W: he becomes a bolt for an instant and strikes down up to 8 m away
 * (or right in front of his lock-on target), untouchable for the flash, and
 * lands with a small burst of lightning that stuns whatever stands close.
 */
export const boltStep: BlinkMove = {
  id: 'bolt-step',
  name: 'Bolt Step',
  element: 'lightning',
  range: 8,
  lockRange: 12,
  staminaCost: 12,
  cooldownTicks: ticks(1.2),
  iframeTicks: ticks(0.2),
  burstRadius: 2.2,
  burstDamage: 8,
};
