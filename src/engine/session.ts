import {
  createWorld,
  DEFAULT_PLAYER_ID,
  ensureMeadowPopulated,
  getWorldTime,
  tickWorld,
  type Intent,
  type IntentInput,
  type PlayerId,
  type TimeOfDayLock,
  type WorldState,
  type WorldTime,
} from '../sim';
import { PhysicsWorld, type Rapier } from '../sim/physics';
import { EventBus } from './event-bus';
import { clearSave, loadSave, writeSave, type SaveStorage } from './save';
import { LoopbackTransport, type Transport } from './transport';

export interface SessionOptions {
  world: WorldState;
  transport?: Transport;
  storage?: SaveStorage;
  localPlayerId?: PlayerId;
  /** Wall clock; injectable for tests. */
  clock?: () => number;
}

/**
 * One running game: the world, how intents reach it, and where its events go.
 * Camera, HUD and input bind to `localPlayerId`, never to a player singleton.
 */
export class Session {
  world: WorldState;
  readonly transport: Transport;
  readonly bus = new EventBus();
  readonly localPlayerId: PlayerId;
  readonly storage: SaveStorage | undefined;
  readonly clock: () => number;

  /** Player's time-of-day lock (the settings store and menu arrive in M2). */
  timeLock: TimeOfDayLock = 'live';
  /** Dev scrub / test override of the day fraction; null = none. */
  timeOverride: number | null = null;

  private readonly resetHandlers = new Set<(world: WorldState) => void>();
  private rapier: Rapier | undefined;
  /** Rapier collision, rebuilt for each new world. Absent until attached (and in some tests). */
  physics: PhysicsWorld | undefined;

  constructor(options: SessionOptions) {
    this.world = options.world;
    this.transport = options.transport ?? new LoopbackTransport();
    this.storage = options.storage;
    this.localPlayerId = options.localPlayerId ?? DEFAULT_PLAYER_ID;
    this.clock = options.clock ?? (() => Date.now());
    this.transport.onMessage((message) => {
      if (message.kind === 'events') {
        for (const event of message.events) this.bus.emit(event);
      }
    });
  }

  get isAuthority(): boolean {
    return this.transport.isAuthority;
  }

  /** Enables Rapier collision (the module is loaded asynchronously by the engine). */
  attachPhysics(rapier: Rapier): void {
    this.rapier = rapier;
    this.physics?.free();
    this.physics = new PhysicsWorld(rapier);
  }

  /** Spawns the meadow's god, dummies and wildlife if this world doesn't have them yet. */
  populate(): void {
    const events = ensureMeadowPopulated(this.world, this.isAuthority);
    if (events.length > 0) this.transport.publish({ kind: 'events', tick: this.world.tick, events });
  }

  /** Sends an intent from the local player. It applies on the next tick. */
  sendIntent(input: IntentInput): void {
    this.transport.sendIntent({ ...input, playerId: this.localPlayerId } as Intent);
  }

  /** Runs one 30 Hz tick (host only) and publishes its events. */
  step(nowMs: number = this.clock()): void {
    if (!this.isAuthority) return;
    const events = tickWorld(this.world, {
      nowMs,
      intents: this.transport.receiveIntents(),
      isAuthority: true,
      physics: this.physics,
    });
    if (events.length > 0) {
      this.transport.publish({ kind: 'events', tick: this.world.tick, events });
    }
  }

  /** Current time of day from the world's clock, the prologue and the player's lock. */
  worldTime(): WorldTime {
    return getWorldTime(this.world.nowMs, {
      lock: this.timeLock,
      prologue: !this.world.flags.prologueDone,
      override: this.timeOverride,
    });
  }

  save(): boolean {
    return writeSave(this.storage, this.world);
  }

  /** "New game": clears the save and starts a fresh world (prologue again). */
  newGame(seed: number): void {
    clearSave(this.storage);
    this.transport.receiveIntents(); // drop intents meant for the old world
    this.world = createWorld(seed, this.clock(), Object.keys(this.world.players));
    if (this.rapier) this.attachPhysics(this.rapier);
    this.populate();
    this.save();
    for (const handler of this.resetHandlers) handler(this.world);
  }

  /** Called when the world object is replaced (new game). */
  onReset(handler: (world: WorldState) => void): () => void {
    this.resetHandlers.add(handler);
    return () => this.resetHandlers.delete(handler);
  }
}

export interface OpenedSession {
  session: Session;
  /** Whether an existing save was loaded (the title screen offers "Continue"). */
  resumed: boolean;
}

/** Loads the saved world if there is a valid one, otherwise starts a new one. */
export function openSession(storage: SaveStorage | undefined, newSeed: () => number, clock = () => Date.now()): OpenedSession {
  const result = loadSave(storage);
  let opened: OpenedSession;
  if (result.status === 'loaded') {
    opened = { session: new Session({ world: result.world, storage, clock }), resumed: true };
  } else {
    if (result.status === 'corrupt') {
      console.warn(`Weaponcraft: ignoring unreadable save (${result.reason}). Starting a new game.`);
    }
    opened = { session: new Session({ world: createWorld(newSeed(), clock()), storage, clock }), resumed: false };
  }
  // Older saves (before M3) and brand-new worlds get the meadow's cast.
  opened.session.populate();
  return opened;
}

/** A fresh world seed. Engine code may use real randomness; the sim may not. */
export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0];
}
