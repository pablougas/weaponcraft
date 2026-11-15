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
  'hero:attack': { entityId: EntityId; kind: AttackKind; power?: number; abilityId?: string };
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
  /** A prologue tutorial step was completed; `next` is the step now shown (null when all are done). */
  'tutorial:step': { stepId: string; next: string | null };
  'cutscene:start': { cutsceneId: string; skippable: boolean };
  /** A named moment in a cutscene's timeline (rocket: launch, impact, collapse, pan, return). */
  'cutscene:beat': { cutsceneId: string; beat: string };
  'cutscene:end': { cutsceneId: string; skipped: boolean };
  'objective:set': { objectiveId: string };
  /** A god rested at a bed: healed (and later, respawns there). */
  'hero:rested': { playerId: PlayerId };
  /** A god joined a player's party (Hades, M6). */
  'party:joined': { playerId: PlayerId; entityId: EntityId; defId: string };
  /** A player switched which god they control (V). */
  'party:switched': { playerId: PlayerId; entityId: EntityId; defId: string };
  /** A god lay down at a bed. */
  'hero:resting': { entityId: EntityId; bedId: EntityId };
  /** A god fell in battle. */
  'hero:down': { entityId: EntityId };
  /** A fallen god woke at a bed (or their last safe spot). */
  'hero:revived': { entityId: EntityId; bedId: EntityId | null };
  /** Read the humans' dispatch in the grotto. */
  'dispatch:read': { playerId: PlayerId };
  /** A shield-bearer blocked a hit from the front. */
  'combat:blocked': { attackerId: EntityId | null; targetId: EntityId };
  /** A soldier glimpsed something and is coming to look. */
  'soldier:suspicious': { entityId: EntityId };
  /** A soldier shouted (or a sentry sounded the horn): nearby soldiers come running. */
  'soldier:alarm': { entityId: EntityId; kind: string; at: Vec3 };
  /** A sentry captain fell: his squad breaks and runs. */
  'soldier:rout': { squadId: string; captainId: EntityId };
  /** A soldier is winding up an attack (the god can roll out of it). */
  'soldier:windup': { entityId: EntityId; kind: string; ticks: number };
  /** A soldier's melee attack landed or missed. */
  'soldier:strike': { entityId: EntityId; kind: string };
  /** A fort came into view (it's on the map now). */
  'fort:spotted': { fortId: string };
  /** Every soldier in a fort is down. */
  'fort:cleared': { fortId: string };
  /** A fort's chest was opened. */
  'chest:opened': { playerId: PlayerId; fortId: string; weaponId: string | null };
  /** The barricade over the tunnel was torn down: the way to the Asphodel Fields is open. */
  'barricade:broken': { by: EntityId | null };
  /** Looked at the barricade over the tunnel deeper in (it opens in M6). */
  'barricade:examined': { playerId: PlayerId };
  /** Talked to a story character. */
  'npc:talk': { playerId: PlayerId; npcId: EntityId; name: string };
  /** Someone used the Forge. */
  'forge:used': { playerId: PlayerId };
  /** The hero was put back on safe ground (stuck or fell out of the world). */
  'hero:recovered': { entityId: EntityId; reason: string };
}

export type EventType = keyof EventMap;

export type GameEvent = {
  [K in EventType]: { type: K; tick: number } & EventMap[K];
}[EventType];

export type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
