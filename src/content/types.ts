import type { AbilityModule } from '../sim/abilities';
import type { Element } from '../sim/types';
import type { ModelFactory } from '../view/entity-model';

/**
 * Fields every content definition shares. Each registry's def type extends
 * this as its milestone fills it in (see SPEC §12).
 */
export interface ContentDef {
  /** Stable, unique ID within its registry, e.g. `"zeus"` or `"bronze-spear"`. */
  id: string;
  /** Unapproved content only appears on `?preview=<type>`, never in normal play. */
  approved: boolean;
}

/**
 * Lazily loads a def's 3D model. Defs stay plain data for the sim; only the
 * view calls this, so three.js never loads into sim code or its tests.
 */
export type ModelLoader = () => Promise<{ createModel: ModelFactory }>;

/** Collision/hit capsule. */
export interface BodySize {
  radius: number;
  height: number;
}

export interface GodDef extends ContentDef {
  name: string;
  maxHealth: number;
  maxStamina: number;
  /** m/s */
  walkSpeed: number;
  sprintSpeed: number;
  /** Initial upward speed of a jump, m/s. */
  jumpSpeed: number;
  /** How long holding jump can slow the fall, in ticks. */
  hoverTicks: number;
  body: BodySize;
  /** God ability on Q. */
  ability: AbilityModule;
  starterWeaponId: string;
  model: ModelLoader;
}

/** Anything in the world you can hit that isn't a player: practice dummies, wildlife, later soldiers. */
export interface EnemyDef extends ContentDef {
  name: string;
  maxHealth: number;
  body: BodySize;
  /** Wildlife wanders and flees when hit; dummies stand still and reset. */
  wanders: boolean;
  /** Walking speed in m/s (0 for dummies). */
  speed: number;
  model: ModelLoader;
}

export interface AttackSpec {
  damage: number;
  /** Reach in metres from the attacker's centre. */
  range: number;
  /** Width of the hit arc in front of the attacker, degrees. */
  arcDeg: number;
  /** Tick (after the attack starts) on which the hit lands. */
  hitTick: number;
  /** Total length of the attack in ticks. */
  totalTicks: number;
  staminaCost: number;
  /** Hits every target in the arc (true) or only the nearest (false). */
  cleave: boolean;
  /** Forward step during the wind-up, m/s. */
  lunge: number;
}

export interface WeaponDef extends ContentDef {
  name: string;
  archetype: 'spear' | 'sword' | 'axe' | 'bow' | 'staff';
  element: Element | null;
  light: AttackSpec;
  heavy: AttackSpec;
}
