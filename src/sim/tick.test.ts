import { describe, expect, it } from 'vitest';
import type { Intent } from './intents';
import { serialize } from './serialize';
import { tickWorld } from './tick';
import { ensureMeadowPopulated } from './populate';
import { groundHeightAt } from './terrain/meadow-rocks';
import { createSimContext, createWorld, despawn, spawn } from './world';

const spawnIntent = (defId: string): Intent => ({ type: 'dev:spawn', playerId: 'p1', defId });

describe('tickWorld', () => {
  it('advances the tick and stamps the clock', () => {
    const world = createWorld(1, 100);
    tickWorld(world, { nowMs: 200, intents: [], isAuthority: true });
    expect(world).toMatchObject({ tick: 1, nowMs: 200 });
  });

  it('applies intents in order and emits plain-data events', () => {
    const world = createWorld(1, 0);
    const events = tickWorld(world, { nowMs: 0, intents: [spawnIntent('a'), spawnIntent('b')], isAuthority: true });
    expect(Object.values(world.entities).map((e) => [e.id, e.defId])).toEqual([['e1', 'a'], ['e2', 'b']]);
    expect(events).toEqual([
      { type: 'entity:spawned', tick: 1, entityId: 'e1', defId: 'a' },
      { type: 'entity:spawned', tick: 1, entityId: 'e2', defId: 'b' },
    ]);
    expect(JSON.parse(JSON.stringify(events))).toEqual(events);
  });

  it('never reuses entity IDs', () => {
    const world = createWorld(1, 0);
    const { ctx } = createSimContext(world, true);
    const first = spawn(ctx, 'a');
    despawn(ctx, first);
    expect(spawn(ctx, 'b')).toBe('e2');
  });

  it('ignores player intents during a cutscene', () => {
    const world = createWorld(1, 0);
    world.cutscene = { id: 'rocket', startTick: 0 };
    const events = tickWorld(world, { nowMs: 0, intents: [spawnIntent('a')], isAuthority: true });
    expect(world.entities).toEqual({});
    expect(events).toEqual([
      { type: 'intent:rejected', tick: 1, playerId: 'p1', intentType: 'dev:spawn', reason: 'cutscene active' },
    ]);
  });

  it('rejects intents from unknown players', () => {
    const world = createWorld(1, 0);
    const events = tickWorld(world, {
      nowMs: 0, isAuthority: true, intents: [{ type: 'dev:spawn', playerId: 'p9', defId: 'a' }],
    });
    expect(world.entities).toEqual({});
    expect(events[0]).toMatchObject({ type: 'intent:rejected', reason: 'unknown player' });
  });

  it('only the authority decides outcomes', () => {
    const world = createWorld(1, 0);
    tickWorld(world, { nowMs: 0, intents: [spawnIntent('a')], isAuthority: false });
    expect(world.entities).toEqual({});
  });

  it('is deterministic for the same seed and inputs', () => {
    const run = () => {
      const world = createWorld(77, 0);
      for (let t = 0; t < 10; t += 1) {
        tickWorld(world, { nowMs: t * 33, intents: t % 3 === 0 ? [spawnIntent(`d${t}`)] : [], isAuthority: true });
      }
      return serialize(world);
    };
    expect(run()).toBe(run());
  });

  it('despawning clears the player link', () => {
    const world = createWorld(1, 0);
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'zeus', { ownerId: 'p1' });
    world.players.p1.entityId = id;
    despawn(ctx, id);
    expect(world.players.p1.entityId).toBeNull();
  });

  it('dev:teleport puts the hero on the ground at the requested spot', () => {
    const world = createWorld(1, 0);
    ensureMeadowPopulated(world);
    tickWorld(world, { nowMs: 0, isAuthority: true, intents: [{ type: 'dev:teleport', playerId: 'p1', x: 30.5, z: -12.25, rotationY: 1 }] });
    const hero = world.entities[world.players.p1.entityId!];
    expect(hero.position.x).toBeCloseTo(30.5, 5);
    expect(hero.position.y).toBeCloseTo(groundHeightAt(30.5, -12.25), 2);
    expect(hero.rotationY).toBe(1);
  });
});
