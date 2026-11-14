import type { PlayerId, Vec3 } from './types';

/**
 * Input never changes state directly. It produces intents tagged with the
 * player who sent them; only the sim applies them (CLAUDE.md rule 2).
 */
export type Intent =
  | { type: 'dev:spawn'; playerId: PlayerId; defId: string; position?: Vec3 }
  | { type: 'dev:despawn'; playerId: PlayerId; entityId: string }
  /** Held input, sent every tick: world-space move direction (length ≤ 1) and held buttons. */
  | { type: 'player:move'; playerId: PlayerId; x: number; z: number; sprint: boolean; jumpHeld: boolean }
  /** A button press. */
  | { type: 'player:action'; playerId: PlayerId; action: PlayerAction };

export type PlayerAction = 'jump' | 'dodge' | 'lightAttack' | 'heavyAttack' | 'godAbility' | 'lockOn';

export type IntentType = Intent['type'];

/** An intent before the transport stamps it with the sending player's ID. */
export type IntentInput = Intent extends infer I ? (I extends Intent ? Omit<I, 'playerId'> : never) : never;

/** Intents that still apply while a cutscene has locked player input. */
export const CUTSCENE_ALLOWED_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>([]);
