import type { PlayerId, Vec3 } from './types';

/**
 * Input never changes state directly. It produces intents tagged with the
 * player who sent them; only the sim applies them (CLAUDE.md rule 2).
 */
export type Intent =
  | { type: 'dev:spawn'; playerId: PlayerId; defId: string; position?: Vec3 }
  | { type: 'dev:despawn'; playerId: PlayerId; entityId: string }
  /** Dev/test: put a weapon in the sender's inventory. */
  | { type: 'dev:give'; playerId: PlayerId; weaponId: string }
  /** Equip the weapon in inventory slot `slot`. */
  | { type: 'player:equip'; playerId: PlayerId; slot: number }
  /** Fuse inventory slots A and B at a Fusion Altar (order matters for unknown pairs: shape of A; the result takes the god's element). */
  | { type: 'player:fuse'; playerId: PlayerId; slotA: number; slotB: number }
  /** Dev/test: move the sender's hero onto the ground at (x, z), facing `rotationY`. M6 uses it for "teleport to biome". */
  | { type: 'dev:teleport'; playerId: PlayerId; x: number; z: number; rotationY?: number }
  /**
   * Held input, sent when it changes: world-space move direction (length ≤ 1),
   * held buttons, and the camera heading the player aims along.
   */
  | {
    type: 'player:move';
    playerId: PlayerId;
    x: number;
    z: number;
    sprint: boolean;
    jumpHeld: boolean;
    /** Q held: keep firing the god ability. */
    abilityHeld?: boolean;
    /** D held: charging the charged move (Lightning Fist); releasing throws it. */
    chargeHeld?: boolean;
    /** S held: tap for a light weapon strike, hold for heavy. */
    weaponHeld?: boolean;
    /** Camera heading, radians (forward = (sin, cos)). */
    aimYaw?: number;
  }
  /** A button press. */
  | { type: 'player:action'; playerId: PlayerId; action: PlayerAction };

export type PlayerAction = 'jump' | 'dodge' | 'punch' | 'lightAttack' | 'heavyAttack' | 'godAbility' | 'ultimate' | 'lockOn' | 'interact';

export type IntentType = Intent['type'];

/** An intent before the transport stamps it with the sending player's ID. */
export type IntentInput = Intent extends infer I ? (I extends Intent ? Omit<I, 'playerId'> : never) : never;

/** Intents that still apply while a cutscene has locked player input. */
export const CUTSCENE_ALLOWED_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>([]);
