import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../../engine/physics';
import type { Intent } from '../intents';
import { PhysicsWorld, type Rapier } from '../physics';
import { ensureMeadowPopulated } from '../populate';
import { MEADOW_RADIUS } from '../constants';
import { groundHeightAt, HERO_ROCK } from '../terrain/meadow-rocks';
import { tickWorld } from '../tick';
import type { Entity } from '../types';
import { createWorld } from '../world';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

function setup(withPhysics = true) {
  const world = createWorld(7, 0);
  ensureMeadowPopulated(world);
  const physics = withPhysics ? new PhysicsWorld(R) : undefined;
  const hero = () => world.entities[world.players.p1.entityId!] as Entity & { hero: NonNullable<Entity['hero']> };
  const run = (intents: Intent[], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 0, isAuthority: true, intents: t === 0 ? intents : [], physics }));
    return events;
  };
  const blink: Intent = { type: 'player:action', playerId: 'p1', action: 'blink' };
  const place = (x: number, z: number, rotationY: number) => run([{ type: 'dev:teleport', playerId: 'p1', x, z, rotationY }], 3);
  return { world, hero, run, blink, place };
}

describe('Bolt Step (W)', () => {
  it('flashes about 8 m ahead in one tick, costs 12 stamina and goes on cooldown', () => {
    const { hero, run, blink, place } = setup();
    place(-20, -20, Math.PI); // open meadow, facing −z
    const start = { ...hero().position };
    const stamina = hero().stamina!.current;
    const events = run([blink]);
    const moved = Math.hypot(hero().position.x - start.x, hero().position.z - start.z);
    expect(moved).toBeGreaterThan(7);
    expect(moved).toBeLessThan(8.6);
    expect(hero().stamina!.current).toBeCloseTo(stamina - 12, 0);
    expect(hero().hero.cooldowns['bolt-step']).toBeGreaterThan(0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'ability:blink', casterId: hero().id }));
    expect(run([blink])).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'cooling down' }));
  });

  it('lands in front of the lock-on target and its burst hits it', () => {
    const { world, hero, run, blink, place } = setup();
    const dummy = Object.values(world.entities).find((e) => e.defId === 'practice-dummy')!;
    place(dummy.position.x, dummy.position.z - 9, 0);
    run([{ type: 'player:action', playerId: 'p1', action: 'lockOn' }]);
    expect(hero().hero.lockTarget).toBe(dummy.id);
    const events = run([blink]);
    const gap = Math.hypot(hero().position.x - dummy.position.x, hero().position.z - dummy.position.z);
    expect(gap).toBeLessThan(2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'combat:hit', targetId: dummy.id, kind: 'ability' }));
  });

  it('cannot pass through the hero rock', () => {
    const { hero, run, blink, place } = setup();
    const x = 0;
    const z = HERO_ROCK.center.z - HERO_ROCK.scale.z - 3; // north of the rock, facing it (+z)
    place(x, z, 0);
    run([blink]);
    expect(hero().position.z).toBeLessThan(HERO_ROCK.center.z - 1);
  });

  it('stays inside the meadow edge and on the ground', () => {
    const { hero, run, blink, place } = setup();
    const b = (110 * Math.PI) / 180;
    place(Math.sin(b) * (MEADOW_RADIUS - 4), Math.cos(b) * (MEADOW_RADIUS - 4), b);
    run([blink], 2);
    const p = hero().position;
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(MEADOW_RADIUS);
    expect(p.y).toBeGreaterThanOrEqual(groundHeightAt(p.x, p.z) - 0.3);
  });

  it('works without physics too (walks the terrain height)', () => {
    const { hero, run, blink, place } = setup(false);
    place(-20, -20, Math.PI);
    run([blink]);
    expect(hero().position.z).toBeLessThan(-27);
  });
});

describe('stamina', () => {
  it('refills from empty in about 2 s after a short pause', () => {
    const { hero, run, place } = setup();
    place(-20, -20, 0);
    hero().stamina!.current = 0;
    run([], 70);
    expect(hero().stamina!.current).toBe(100);
  });
});
