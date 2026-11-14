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
  /** Collision/hit size: capsule radius and total height in metres. */
  body?: { radius: number; height: number };
  /** Hit points, for anything that can be hit. */
  health?: Meter;
  /** Stamina (sprint, dodge, hover, attacks). */
  stamina?: Meter;
  /** Player-controlled god. */
  hero?: HeroState;
  /** Practice dummies and wildlife. */
  creature?: CreatureState;
}

export interface Meter {
  current: number;
  max: number;
}

export type AttackKind = 'light' | 'heavy';

/** The four elements of the counter wheel (SPEC §7). */
export type Element = 'light' | 'shadow' | 'poison' | 'lightning';

export interface HeroState {
  /** Latest held input: world-space move direction (length ≤ 1), sprint and jump buttons. */
  move: { x: number; z: number };
  sprint: boolean;
  jumpHeld: boolean;
  /** Vertical speed in m/s (gravity is applied by the sim). */
  vy: number;
  grounded: boolean;
  /** Ticks of hover still available in this jump. */
  hoverLeft: number;
  /** Active dodge roll, if any. */
  dodge: { ticksLeft: number; dir: { x: number; z: number } } | null;
  /** Ticks of invulnerability left. */
  iframes: number;
  /** Active attack: which, and how many ticks since it started. */
  attack: { kind: AttackKind; tick: number; hit: boolean } | null;
  /** Ticks until each ability can be used again, by ability ID. */
  cooldowns: Record<string, number>;
  /** Locked-on target (Tab), if any. */
  lockTarget: EntityId | null;
  /** Equipped weapon definition ID. */
  weaponId: string;
  /** Ticks before stamina starts regenerating again. */
  staminaDelay: number;
  /** Ticks left of the "just got hurt" reaction. */
  hurtTicks: number;
  /** Derived each tick, for the view: moving faster than a stroll, and sprinting. */
  moving: boolean;
  sprinting: boolean;
}

export interface CreatureState {
  /** Wildlife wanders and flees; practice dummies stay put. */
  wanders: boolean;
  /** Where it was placed; dummies stay here, wildlife wanders around it. */
  home: Vec3;
  /** Wander destination, if walking somewhere. */
  target: Vec3 | null;
  /** Ticks to wait before choosing a new destination. */
  wait: number;
  /** Ticks left of running away after being hit. */
  flee: number;
  /** Ticks since it was last hit (dummies heal after a while). */
  sinceHit: number;
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
  /** The meadow's god, dummies and wildlife have been spawned (false/missing in older saves). */
  meadowPopulated: boolean;
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
