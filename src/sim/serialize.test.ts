import { describe, expect, it } from 'vitest';
import { worldRng } from './rng';
import { cloneWorld, deserialize, SaveFormatError, serialize } from './serialize';
import { tickWorld } from './tick';
import { createWorld } from './world';

function busyWorld() {
  const world = createWorld(1234, 1_700_000_000_000);
  tickWorld(world, {
    nowMs: 1_700_000_000_033,
    isAuthority: true,
    intents: [
      { type: 'dev:spawn', playerId: 'p1', defId: 'marker', position: { x: 1, y: 2, z: 3 } },
      { type: 'dev:spawn', playerId: 'p1', defId: 'sheep' },
    ],
  });
  world.entities.e1.data = { hp: 7, tags: ['a', 'b'], nested: { ok: true, none: null } };
  world.flags.prologueDone = true;
  world.cutscene = { id: 'rocket', startTick: 1 };
  worldRng(world, 'loot').next();
  return world;
}

describe('serialize / deserialize', () => {
  it('round-trips a world exactly', () => {
    const world = busyWorld();
    const text = serialize(world);
    expect(deserialize(text)).toEqual(world);
    expect(serialize(deserialize(text))).toBe(text);
  });

  it('cloneWorld is detached from the original', () => {
    const world = busyWorld();
    const copy = cloneWorld(world);
    copy.entities.e1.position.x = 99;
    expect(world.entities.e1.position.x).toBe(1);
  });

  it('a restored world keeps ticking identically', () => {
    const a = busyWorld();
    a.cutscene = null; // let the spawn intent through
    const b = deserialize(serialize(a));
    const input = { nowMs: 5, isAuthority: true, intents: [{ type: 'dev:spawn' as const, playerId: 'p1', defId: 'x' }] };
    tickWorld(a, input);
    tickWorld(b, input);
    expect(serialize(b)).toBe(serialize(a));
    expect(Object.keys(b.entities)).toEqual(['e1', 'e2', 'e3']);
  });

  it.each([
    ['not JSON', '{'],
    ['wrong format', JSON.stringify({ format: 'other', version: 1, world: {} })],
    ['future version', JSON.stringify({ format: 'weaponcraft-world', version: 99, world: {} })],
    ['missing fields', JSON.stringify({ format: 'weaponcraft-world', version: 1, world: { seed: 1 } })],
  ])('rejects %s', (_name, text) => {
    expect(() => deserialize(text)).toThrow(SaveFormatError);
  });

  it('rejects an entity stored under the wrong ID', () => {
    const world = busyWorld();
    world.entities.e9 = world.entities.e1;
    expect(() => deserialize(serialize(world))).toThrow(/e9/);
  });
});
