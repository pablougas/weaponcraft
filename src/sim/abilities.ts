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
  /** HUD icon (a glyph name in ui/hud.ts); each god's moves have their own look. Defaults to the slot's icon. */
  icon?: string;
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
  /** HUD icon (a glyph name in ui/hud.ts); each god's moves have their own look. Defaults to the slot's icon. */
  icon?: string;
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
  /** Drawn as a ring around the caster (Grasp of the Dead) instead of a punch. */
  ring?: boolean;
}

/**
 * A short-range lightning teleport (Zeus's Bolt Step on W): flash forward,
 * or to the locked-on target, briefly untouchable, landing with a small
 * lightning burst. The sim moves the god with the character controller, so
 * it can't pass through rocks or trees, and keeps it inside the meadow.
 */
export interface BlinkMove {
  /** HUD icon (a glyph name in ui/hud.ts); each god's moves have their own look. Defaults to the slot's icon. */
  icon?: string;
  id: string;
  name: string;
  element: 'light' | 'shadow' | 'poison' | 'lightning';
  /** Distance without a lock-on target, metres. */
  range: number;
  /** A locked-on target closer than this is jumped to (landing just in front of it). */
  lockRange: number;
  staminaCost: number;
  cooldownTicks: number;
  iframeTicks: number;
  burstRadius: number;
  burstDamage: number;
  /** Shadow Step: land behind the lock-on target instead of in front of it. */
  behindTarget?: boolean;
  /** Leave a decoy at the start point that enemies chase, for this many ticks. */
  decoyTicks?: number;
  /** The next attack within `ticks` deals `multiplier` × damage. */
  ambush?: { ticks: number; multiplier: number };
}

/**
 * A called-down ultimate (Zeus's Sky Strike on R): marks a point, then lands
 * after `telegraphTicks`. It spends all current stamina; damage scales with it.
 */
export interface UltimateModule {
  /** HUD icon (a glyph name in ui/hud.ts); each god's moves have their own look. Defaults to the slot's icon. */
  icon?: string;
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
