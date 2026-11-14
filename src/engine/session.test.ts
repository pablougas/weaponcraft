import { describe, expect, it } from 'vitest';
import { createWorld, serialize } from '../sim';
import { clearSave, loadSave, SAVE_KEY, writeSave, type SaveStorage } from './save';
import { openSession, Session } from './session';
import { LoopbackTransport } from './transport';

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('save', () => {
  it('uses a namespaced key', () => {
    expect(SAVE_KEY.startsWith('weaponcraft:')).toBe(true);
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    const world = createWorld(3, 10);
    expect(writeSave(storage, world)).toBe(true);
    expect(loadSave(storage)).toEqual({ status: 'loaded', world });
    clearSave(storage);
    expect(loadSave(storage)).toEqual({ status: 'empty' });
  });

  it('reports corrupt saves instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, 'garbage');
    expect(loadSave(storage).status).toBe('corrupt');
  });

  it('survives blocked storage', () => {
    const blocked: SaveStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };
    expect(loadSave(blocked)).toEqual({ status: 'empty' });
    expect(writeSave(blocked, createWorld(1, 0))).toBe(false);
    expect(() => clearSave(blocked)).not.toThrow();
    expect(loadSave(undefined)).toEqual({ status: 'empty' });
  });
});

describe('Session', () => {
  it('stamps intents with the local player and applies them on the next tick', () => {
    const session = new Session({ world: createWorld(1, 0), clock: () => 50 });
    const spawned: string[] = [];
    session.bus.on('entity:spawned', (event) => spawned.push(event.entityId));
    session.sendIntent({ type: 'dev:spawn', defId: 'marker' });
    expect(spawned).toEqual([]);
    session.step();
    expect(spawned).toEqual([`e${session.world.nextEntityId - 1}`]);
    expect(session.world).toMatchObject({ tick: 1, nowMs: 50 });
  });

  it('delivers events through the transport', () => {
    const transport = new LoopbackTransport();
    const messages: string[] = [];
    transport.onMessage((message) => messages.push(message.kind));
    const session = new Session({ world: createWorld(1, 0), transport });
    session.sendIntent({ type: 'dev:spawn', defId: 'marker' });
    session.step(0);
    expect(messages).toEqual(['events']);
  });

  it('keeps players in a map keyed by ID (no singleton)', () => {
    const session = new Session({ world: createWorld(1, 0, ['p1', 'p2']), localPlayerId: 'p2' });
    session.sendIntent({ type: 'dev:spawn', defId: 'x' });
    const queued = session.transport.receiveIntents();
    expect(queued[0].playerId).toBe('p2');
    expect(Object.keys(session.world.players)).toEqual(['p1', 'p2']);
  });

  it('time comes from the world clock, prologue and lock', () => {
    const session = new Session({ world: createWorld(1, 0) });
    expect(session.worldTime().source).toBe('prologue');
    session.world.flags.prologueDone = true;
    session.timeLock = 'night';
    expect(session.worldTime().source).toBe('lock');
    session.timeOverride = 0.5;
    expect(session.worldTime().dayFraction).toBe(0.5);
  });

  it('resumes a saved game and New game resets it', () => {
    const storage = memoryStorage();
    const first = openSession(storage, () => 11, () => 0);
    expect(first.resumed).toBe(false);
    first.session.sendIntent({ type: 'dev:spawn', defId: 'marker' });
    first.session.step();
    first.session.world.flags.prologueDone = true;
    first.session.save();

    const second = openSession(storage, () => 22, () => 0);
    expect(second.resumed).toBe(true);
    expect(serialize(second.session.world)).toBe(serialize(first.session.world));

    let resetSeed = -1;
    second.session.onReset((world) => { resetSeed = world.seed; });
    second.session.sendIntent({ type: 'dev:spawn', defId: 'stale' });
    second.session.newGame(33);
    expect(resetSeed).toBe(33);
    second.session.step();
    expect(second.session.world).toMatchObject({ seed: 33, tick: 1, flags: { prologueDone: false, meadowPopulated: true } });
    // A fresh meadow: the god, three dummies, five sheep; the stale spawn intent was dropped.
    expect(Object.values(second.session.world.entities).map((e) => e.defId).sort()).toEqual(
      ['practice-dummy', 'practice-dummy', 'practice-dummy', 'sheep', 'sheep', 'sheep', 'sheep', 'sheep', 'zeus'],
    );
    expect(openSession(storage, () => 44, () => 0).session.world.seed).toBe(33);
  });

  it('starts fresh when the save is corrupt', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{"format":"nope"}');
    const warn = console.warn;
    console.warn = () => undefined;
    try {
      const opened = openSession(storage, () => 5, () => 0);
      expect(opened).toMatchObject({ resumed: false, session: { world: { seed: 5 } } });
    } finally {
      console.warn = warn;
    }
  });
});
