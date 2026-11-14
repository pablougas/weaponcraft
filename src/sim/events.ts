import type { AttackKind, EntityId, PlayerId, Vec3 } from './types';

/**
 * Events the sim emits each tick. Payloads are plain data and carry IDs, never
 * object references (CLAUDE.md rules 4 and 8). Add new events to this map,
 * e.g. `'fusion:created'`, `'spirit:freed'`, `'cutscene:start'`.
 */
export interface EventMap {
  'entity:spawned': { entityId: EntityId; defId: string };
  'entity:despawned': { entityId: EntityId; defId: string };
  'intent:rejected': { playerId: PlayerId; intentType: string; reason: string };
  'combat:hit': { attackerId: EntityId | null; targetId: EntityId; amount: number; kind: AttackKind | 'ability'; remaining: number };
  'combat:evaded': { attackerId: EntityId | null; targetId: EntityId };
  'entity:defeated': { entityId: EntityId; defId: string; by: EntityId | null };
  'hero:attack': { entityId: EntityId; kind: AttackKind };
  'hero:jump': { entityId: EntityId };
  'hero:dodge': { entityId: EntityId };
  /** An ability went off. `points` runs from the caster through each target, for drawing. */
  'ability:cast': { casterId: EntityId; abilityId: string; targetIds: EntityId[]; points: Vec3[] };
  'ability:fizzled': { casterId: EntityId; abilityId: string; reason: string };
}

export type EventType = keyof EventMap;

export type GameEvent = {
  [K in EventType]: { type: K; tick: number } & EventMap[K];
}[EventType];

export type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
