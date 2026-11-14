import type { AttackSpec } from '../content/types';
import { ticks } from './constants';

/**
 * The unarmed punch combo every god has (A / left mouse): jab, cross,
 * uppercut. Quick, cheap and weak; it works whatever weapon is held.
 */
export const PUNCH_COMBO: readonly AttackSpec[] = [
  { damage: 6, range: 1.7, arcDeg: 80, hitTick: 3, totalTicks: 8, staminaCost: 3, cleave: false, lunge: 1.8 },
  { damage: 7, range: 1.7, arcDeg: 80, hitTick: 3, totalTicks: 8, staminaCost: 3, cleave: false, lunge: 1.8 },
  { damage: 11, range: 1.9, arcDeg: 100, hitTick: 5, totalTicks: 13, staminaCost: 3, cleave: false, lunge: 2.6 },
];

/** After a punch ends, the next press within this window continues the combo. */
export const COMBO_WINDOW_TICKS = ticks(0.45);
