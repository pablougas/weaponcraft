import type { EntityId, PlayerId } from './types';

/**
 * Events the sim emits each tick. Payloads are plain data and carry IDs, never
 * object references (CLAUDE.md rules 4 and 8). Add new events to this map,
 * e.g. `'fusion:created'`, `'spirit:freed'`, `'cutscene:start'`.
 */
export interface EventMap {
  'entity:spawned': { entityId: EntityId; defId: string };
  'entity:despawned': { entityId: EntityId; defId: string };
  'intent:rejected': { playerId: PlayerId; intentType: string; reason: string };
}

export type EventType = keyof EventMap;

export type GameEvent = {
  [K in EventType]: { type: K; tick: number } & EventMap[K];
}[EventType];

export type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
