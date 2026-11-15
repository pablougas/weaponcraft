import type { RegionId } from './regions';
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
  /** Element of this entity, for the counter wheel (practice dummies, later soldiers and mechs). */
  element?: Element | null;
  /** Lingering status effects (poison, blind, stun). */
  statuses?: StatusEffect[];
  /** A weapon lying in the world; F picks it up. */
  pickup?: { weaponId: string };
  /** An interactive structure (F to use). */
  structure?: { kind: 'fusion-altar' | 'forge' | 'bed' | 'dispatch' | 'barricade' | 'chest' };
  /** A soldier or sentry (M6). */
  soldier?: SoldierState;
  /** An arrow in flight: velocity in m/s, life, damage and who shot it. */
  projectile?: { vx: number; vy: number; vz: number; ticksLeft: number; damage: number; ownerId: EntityId };
  /** The fort a chest belongs to. */
  fortId?: string;
  /** A short-lived shadow decoy (Shadow Step): enemies chase it until it fades. */
  decoy?: { ownerId: EntityId; ticksLeft: number };
  /** A story character you can talk to (F). */
  npc?: { name: string };
  /** Which region this entity is in (default: the surface). */
  region?: RegionId;
}

export type StatusKind = 'blind' | 'poison' | 'stun' | 'crush';

export interface StatusEffect {
  kind: StatusKind;
  ticksLeft: number;
  /** Poison: damage per second. */
  power: number;
  sourceId: EntityId | null;
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
  /** A Bolt Step waiting to happen this tick: the horizontal jump in metres. */
  blink?: { dx: number; dz: number } | null;
  /** Resting at a bed: ticks into the rest timeline (systems/rest.ts) and which bed. */
  rest?: { t: number; bedId: EntityId } | null;
  /** Hades's Lord of the Dead: his damage multiplier underground (copied from his GodDef). */
  passiveDamage?: number;
  /** Companion AI bookkeeping: ticks it has tried to move without getting anywhere, and where it was. */
  companionStuck?: number;
  companionLast?: Vec3 | null;
  /** Shadow Step's ambush: the next attack within these ticks deals extra damage. */
  ambush?: { ticks: number; multiplier: number } | null;
  /** Fallen in battle: ticks since falling (then wakes at the Refuge bed). */
  down?: number | null;
  /** Last spot the hero stood safely on, and ticks until it's updated again. */
  lastSafe?: Vec3 | null;
  safeTimer?: number;
  /** Ticks the hero has been trying to move without moving (stuck detection). */
  stuckTicks?: number;
}

export type SoldierKind = 'spear' | 'shield' | 'archer' | 'sentry';

/** A human soldier or sentry (M6): perception and the patrol → alert → attack → search loop. */
export interface SoldierState {
  kind: SoldierKind;
  /** The fort it guards (null for sentries). */
  fortId: string | null;
  state: 'patrol' | 'suspicious' | 'attack' | 'search' | 'return';
  /** 0–100: how sure it is someone's there (suspicious at 25, alert at 60). */
  awareness: number;
  targetId: EntityId | null;
  lastSeen: Vec3 | null;
  /** Ticks since the target was last seen (or in the current state). */
  timer: number;
  patrol: Vec3[];
  patrolIndex: number;
  /** Where it's looking (its sight cone), radians like rotationY. */
  facing: number;
  /** A sentry's post heading, which its sweep centres on. */
  postFacing?: number;
  /** Ticks left winding up an attack (visible to the player), then cooldown. */
  windup: number;
  cooldown: number;
  /** Sentry sweep counter. */
  scan: number;
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
  /** Fights the gods (soldiers and sentries, M6); companions help against these. */
  hostile?: boolean;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  /** The entity this player controls (their god), once spawned (M3). */
  entityId: EntityId | null;
  /** Weapon IDs carried (the equipped one included), in slot order. */
  inventory: string[];
  /** This player has watched the rocket cinematic before (on any save), so they may skip it. */
  seenRocket?: boolean;
  /** The gods this player can switch between (M6: Zeus and Hades); `entityId` is the active one. */
  party?: EntityId[];
  /** World tick before which V can't switch again. */
  switchReadyTick?: number;
  /** Cutscene IDs this player has seen before on this browser (any save): those may be skipped. */
  seenCutscenes?: string[];
}

/** Story and progress flags (SPEC §11). Unknown keys are allowed for content. */
export interface WorldFlags {
  prologueDone: boolean;
  olympusShattered: boolean;
  /** The meadow's god, dummies and wildlife have been spawned (false/missing in older saves). */
  meadowPopulated: boolean;
  /** M5.1: Hades took Zeus down to the Outer Grotto. */
  descended?: boolean;
  /** M6: the forts' soldiers and the sentries are placed. */
  garrisonPlaced?: boolean;
  /** M6: the barricade over the tunnel has been torn down. */
  barricadeBroken?: boolean;
  /** M5.1: the grotto's altar, bed, dispatch and barricade are placed. */
  grottoBuilt?: boolean;
  /** M5: the Forge and the bed were added when the meadow became the Refuge. */
  refugeBuilt?: boolean;
  /** M4: the Fusion Altar, the weapons to find and elemental dummies are placed. */
  armoryPlaced?: boolean;
  [flag: string]: boolean | undefined;
}

export interface CutsceneState {
  id: string;
  /** Tick the cutscene started on. */
  startTick: number;
  /** Can the players skip it? (Not the first time anyone here sees it, SPEC §3.2.) */
  skippable?: boolean;
  /** Named points the cutscene uses (portal positions…), as plain data. */
  points?: Record<string, Vec3>;
}

/** Prologue tutorial progress (SPEC §3.1), saved with the world. */
export interface TutorialState {
  /** IDs of the steps done so far. */
  done: string[];
  /** Ticks spent walking and sprinting, toward the move and sprint steps. */
  movedTicks: number;
  sprintTicks: number;
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
  /** Weapons created in this world by fusing unknown pairs, by ID (plain data, saved). */
  customWeapons: Record<string, WeaponData>;
  /** Fusion Codex: every fusion discovered in this world, by pair key. */
  codex: Record<string, CodexEntry>;
  /** The prologue tutorial. */
  tutorial: TutorialState;
  /** Current objective ID shown to players (e.g. 'find-the-others'), or null. */
  objective: string | null;
  /** The Underworld's forts (M6): cleared once every soldier is down; the chest opened. */
  forts: Record<string, { cleared: boolean; chestOpened: boolean; seen?: boolean }>;
  /** Fog of war per region map (M6): '0'/'1' per 16 m cell (systems/reveal.ts). */
  reveal: { underworld?: string };
  /** World clock time (ms) when the rocket hit Olympus, or null before. */
  olympusShatteredAtMs: number | null;
}

export type WeaponArchetype = 'spear' | 'sword' | 'axe' | 'staff';
export type MaterialId = 'wood' | 'bronze' | 'storm-iron' | 'mech-brass' | 'divine-ore';

/** The pieces a weapon's model is assembled from (SPEC §8), so fusions visibly combine parts. */
export interface WeaponParts {
  handle: 'grip' | 'shaft' | 'pole';
  head: 'spearhead' | 'thunder-tip' | 'blade' | 'axe-head' | 'orb' | 'crescent';
  guard: 'none' | 'crossguard' | 'ring' | 'wings';
}

export interface AttackNumbers {
  damage: number;
  range: number;
  arcDeg: number;
  hitTick: number;
  totalTicks: number;
  staminaCost: number;
  cleave: boolean;
  lunge: number;
}

/** Everything about a weapon, as plain data: registry weapons and fused ones alike. */
export interface WeaponData {
  id: string;
  name: string;
  archetype: WeaponArchetype;
  parts: WeaponParts;
  material: MaterialId;
  element: Element | null;
  light: AttackNumbers;
  heavy: AttackNumbers;
  legendary: boolean;
  description: string;
  /** For fused weapons: the two weapons that made it, in the order chosen. */
  fusedFrom?: [string, string];
}

export interface CodexEntry {
  resultId: string;
  legendary: boolean;
  /** The two weapons, in the order they were first fused. */
  inputs: [string, string];
  discoveredTick: number;
  by: PlayerId;
}
