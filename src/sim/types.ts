// All game state is plain, JSON-serializable data (SPEC §13 rule 1).
// No class instances, functions, Maps, Sets or references to meshes.

export type EntityId = string;
export type PlayerId = string;

/** JSON-safe value for free-form entity data. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Entity {
  /** Stable ID from `spawn()`, e.g. `"e7"`. Never reused within a world. */
  id: EntityId;
  /** Content definition this entity was spawned from, e.g. `"zeus"`. */
  defId: string;
  position: Vec3;
  /** Heading in radians around +Y. */
  rotationY: number;
  /** Player that controls this entity, if any. */
  ownerId: PlayerId | null;
  /** Per-entity state owned by the systems that use it. */
  data: Record<string, JsonValue>;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** The entity this player controls (their god), once spawned (M3). */
  entityId: EntityId | null;
}

/** Story and progress flags (SPEC §11). Unknown keys are allowed for content. */
export interface WorldFlags {
  prologueDone: boolean;
  olympusShattered: boolean;
  [flag: string]: boolean;
}

export interface CutsceneState {
  id: string;
  /** Tick the cutscene started on. */
  startTick: number;
}

export interface WorldState {
  /** Bumped when the shape changes; old saves are migrated or rejected. */
  version: 1;
  /** World seed: the world is seed + edits. */
  seed: number;
  /** Fixed-step tick counter (30 Hz). */
  tick: number;
  /** Wall-clock time (ms since epoch) stamped by the engine on each tick. */
  nowMs: number;
  /** Next number for `spawn()` IDs. */
  nextEntityId: number;
  entities: Record<EntityId, Entity>;
  players: Record<PlayerId, PlayerState>;
  flags: WorldFlags;
  /** Active cutscene; player intents are ignored while set. */
  cutscene: CutsceneState | null;
  /** Saved positions of the seeded RNG streams the sim draws from. */
  rngStreams: Record<string, number>;
}
