import type { AttackKind, Element, EntityId, PlayerId, Vec3 } from './types';

/**
 * Events the sim emits each tick. Payloads are plain data and carry IDs, never
 * object references (CLAUDE.md rules 4 and 8). Add new events to this map,
 * e.g. `'fusion:created'`, `'spirit:freed'`, `'cutscene:start'`.
 */
export interface EventMap {
  'entity:spawned': { entityId: EntityId; defId: string };
  'entity:despawned': { entityId: EntityId; defId: string };
  'intent:rejected': { playerId: PlayerId; intentType: string; reason: string };
  'combat:hit': {
    attackerId: EntityId | null;
    targetId: EntityId;
    amount: number;
    kind: AttackKind | 'ability' | 'status';
    remaining: number;
    /** Element of the hit, and the total multiplier from the wheel and ability boost (2 = super effective). */
    element?: Element | null;
    multiplier?: number;
  };
  'combat:evaded': { attackerId: EntityId | null; targetId: EntityId };
  'entity:defeated': { entityId: EntityId; defId: string; by: EntityId | null };
  'hero:attack': { entityId: EntityId; kind: AttackKind };
  'hero:jump': { entityId: EntityId };
  'hero:dodge': { entityId: EntityId };
  /** An ability went off. `points` runs from the caster through each target, for drawing. */
  'ability:cast': { casterId: EntityId; abilityId: string; targetIds: EntityId[]; points: Vec3[] };
  /** A teleport (Bolt Step): from where to where, and who the landing burst hit. */
  'ability:blink': { casterId: EntityId; abilityId: string; from: Vec3; to: Vec3; targetIds: EntityId[] };
  'ability:fizzled': { casterId: EntityId; abilityId: string; reason: string };
  /** A ground marker before an ability lands (Sky Strike): where, how wide, and how long until it hits. */
  'ability:telegraph': { casterId: EntityId; abilityId: string; point: Vec3; radius: number; ticks: number };
  /** A big area strike landed (Sky Strike). */
  'ability:strike': { casterId: EntityId; abilityId: string; point: Vec3; radius: number; targetIds: EntityId[] };
  /** Charging a charged move started (Lightning Fist). */
  'hero:charge': { entityId: EntityId; abilityId: string };
  /** Ran out of stamina while holding an ability: regen pauses longer. */
  'hero:exhausted': { entityId: EntityId };
  /** A weapon was picked up from the ground. */
  'item:picked': { playerId: PlayerId; weaponId: string; entityId: EntityId };
  /** A player used the Fusion Altar (F): their UI opens. */
  'altar:opened': { playerId: PlayerId; altarId: EntityId };
  'weapon:equipped': { playerId: PlayerId; weaponId: string };
  /** Two weapons were fused. `newDiscovery` = first time this pair was fused in this world. */
  'fusion:created': { playerId: PlayerId; resultId: string; key: string; legendary: boolean; newDiscovery: boolean; inputs: [string, string] };
  /** The hero was put back on safe ground (stuck or fell out of the world). */
  'hero:recovered': { entityId: EntityId; reason: string };
}

export type EventType = keyof EventMap;

export type GameEvent = {
  [K in EventType]: { type: K; tick: number } & EventMap[K];
}[EventType];

export type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
