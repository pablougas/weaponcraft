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

/** Weapon light/heavy strikes, the unarmed punch combo, and a charged ability punch (Lightning Fist). */
export type AttackKind = 'light' | 'heavy' | 'punch' | 'fist';

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
  /**
   * Active attack: which, and how many ticks since it started. `step` is the
   * punch-combo step (1–3); `power` is a charged move's charge (0–1).
   */
  attack: { kind: AttackKind; tick: number; hit: boolean; step?: number; power?: number } | null;
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
  // ---- M3.1 fields. Optional so saves from before M3.1 still load; `heroDefaults` fills them in.
  /** Camera heading the player is aiming along (radians, same convention as rotationY). */
  aimYaw?: number;
  /** Held buttons: god ability (Q), charged move (D), weapon strike (S). */
  abilityHeld?: boolean;
  chargeHeld?: boolean;
  weaponHeld?: boolean;
  /** Ticks the weapon button has been held (−1 = not counting). Short = light, long = heavy. */
  weaponHoldTicks?: number;
  /** Ticks the charged move has been charging, or null when not charging. */
  charge?: number | null;
  /** Punch combo: the last step thrown and the ticks left to continue it. */
  combo?: { step: number; window: number };
  /** A press made while busy, retried for a few ticks (input buffer). */
  buffer?: { action: 'dodge' | 'punch' | 'lightAttack' | 'heavyAttack'; ticks: number } | null;
  /** A called-down ultimate waiting to land (Sky Strike): where, how long, and stamina spent. */
  ultimate?: { ticksLeft: number; point: Vec3; spent: number } | null;
  /** Last spot the hero stood safely on, and ticks until it's updated again. */
  lastSafe?: Vec3 | null;
  safeTimer?: number;
  /** Ticks the hero has been trying to move without moving (stuck detection). */
  stuckTicks?: number;
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
  /** Ticks left stunned (can't move). Optional for older saves. */
  stun?: number;
  /** Being knocked back: velocity in m/s and ticks left. */
  knock?: { x: number; z: number; ticks: number } | null;
  /** Ticks in a row a move was blocked (by a rock, another creature…). */
  blocked?: number;
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
