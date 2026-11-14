import type { AttackSpec } from '../content/types';
import type { EntityId, Vec3 } from './types';
import type { SimContext } from './world';

/**
 * A god or spirit ability (Q / E). Content provides these as small modules;
 * the sim calls `cast` when the player presses the key and the cooldown is up.
 * With `repeatWhileHeld`, holding the key casts again every `cooldownTicks`
 * while stamina lasts.
 */
export interface AbilityModule {
  id: string;
  name: string;
  element: 'light' | 'shadow' | 'poison' | 'lightning';
  cooldownTicks: number;
  staminaCost: number;
  /** Holding the button keeps casting at the cooldown rate until stamina runs out. */
  repeatWhileHeld?: boolean;
  /** Returns false if nothing happened, so no cooldown or stamina is spent. */
  cast(ctx: SimContext, casterId: EntityId): boolean;
  /** Optional per-tick behaviour for lasting abilities. */
  update?(ctx: SimContext, casterId: EntityId): void;
}

/**
 * A hold-to-charge melee move (Zeus's Lightning Fist on D). The sim runs the
 * charge and the attack; content supplies the numbers and the on-hit effect.
 */
export interface ChargedMove {
  id: string;
  name: string;
  element: 'light' | 'shadow' | 'poison' | 'lightning';
  /** Full charge after this many ticks; it fires on its own a little after. */
  fullChargeTicks: number;
  /** Stamina at zero charge and at full charge. */
  staminaMin: number;
  staminaMax: number;
  cooldownTicks: number;
  /** The attack thrown at `power` (0–1). */
  attack(power: number): AttackSpec;
  /** Extra effect on each target hit (knockback, a lightning arc…). */
  onHit?(ctx: SimContext, casterId: EntityId, targetId: EntityId, power: number): void;
}

/**
 * A called-down ultimate (Zeus's Sky Strike on R): marks a point, then lands
 * after `telegraphTicks`. It spends all current stamina; damage scales with it.
 */
export interface UltimateModule {
  id: string;
  name: string;
  element: 'light' | 'shadow' | 'poison' | 'lightning';
  cooldownTicks: number;
  /** Needs at least this fraction of max stamina (0–1). */
  minStaminaFraction: number;
  telegraphTicks: number;
  radius: number;
  /** Where it will land, or null if it can't be used. */
  target(ctx: SimContext, casterId: EntityId): Vec3 | null;
  /** Applies the strike at `point` with `spent` stamina. Returns the entities hit. */
  land(ctx: SimContext, casterId: EntityId, point: Vec3, spent: number): EntityId[];
}
