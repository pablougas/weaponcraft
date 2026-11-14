import { ticks } from '../../sim/constants';
import type { WeaponDef } from '../types';

/** Zeus's bronze spear with its lightning tip (the style-test prop). M4 adds parts and materials. */
export const starterSpear: WeaponDef = {
  id: 'starter-spear',
  name: 'Bronze Thunder Spear',
  approved: true,
  archetype: 'spear',
  element: 'lightning',
  // Quick thrust: hits the nearest target in a narrow cone.
  light: { damage: 10, range: 2.6, arcDeg: 70, hitTick: 5, totalTicks: ticks(0.4), staminaCost: 6, cleave: false, lunge: 2.5 },
  // Wide overhead sweep: slower, hits everything in a broad arc.
  heavy: { damage: 24, range: 3.1, arcDeg: 150, hitTick: 13, totalTicks: ticks(0.85), staminaCost: 18, cleave: true, lunge: 1.2 },
};
