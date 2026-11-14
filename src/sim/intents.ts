import type { PlayerId, Vec3 } from './types';

/**
 * Input never changes state directly. It produces intents tagged with the
 * player who sent them; only the sim applies them (CLAUDE.md rule 2).
 * Gameplay intents (move, attack, cast...) arrive with M3.
 */
export type Intent =
  | { type: 'dev:spawn'; playerId: PlayerId; defId: string; position?: Vec3 }
  | { type: 'dev:despawn'; playerId: PlayerId; entityId: string };

export type IntentType = Intent['type'];

/** An intent before the transport stamps it with the sending player's ID. */
export type IntentInput = Intent extends infer I ? (I extends Intent ? Omit<I, 'playerId'> : never) : never;

/** Intents that still apply while a cutscene has locked player input. */
export const CUTSCENE_ALLOWED_INTENTS: ReadonlySet<IntentType> = new Set<IntentType>([]);
