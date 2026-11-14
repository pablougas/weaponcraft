import { describe, expect, it } from 'vitest';
import { applyDamage, targetsInArc } from './combat';
import type { Intent, PlayerAction } from './intents';
import { ensureMeadowPopulated } from './populate';
import { tickWorld } from './tick';
import { groundHeightAt } from './terrain/meadow-rocks';
import type { Entity } from './types';
import { createSimContext, createWorld } from './world';

function arena() {
  const world = createWorld(3, 0);
  ensureMeadowPopulated(world);
  const heroId = world.players.p1.entityId!;
  const hero = world.entities[heroId] as Entity & { hero: NonNullable<Entity['hero']> };
  const dummies = Object.values(world.entities).filter((e) => e.defId === 'practice-dummy');
  // Move the sheep far away so they don't interfere.
  for (const e of Object.values(world.entities)) if (e.defId === 'sheep') e.position = { x: 60, y: groundHeightAt(60, 60), z: 60 };
  const run = (n: number, intents: Intent[] = []) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: t, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  const act = (action: PlayerAction): Intent => ({ type: 'player:action', playerId: 'p1', action });
  /** Stands the hero `distance` m in front of a dummy, facing it. */
  const faceDummy = (dummy: Entity, distance: number) => {
    const x = dummy.position.x;
    const z = dummy.position.z - distance;
    hero.position = { x, y: groundHeightAt(x, z), z };
    hero.rotationY = 0; // facing +z, toward the dummy
    hero.hero.grounded = true;
  };
  return { world, hero, dummies, run, act, faceDummy };
}

describe('attacks', () => {
  it('a light thrust damages the nearest dummy in front', () => {
    const { hero, dummies, run, act, faceDummy } = arena();
    faceDummy(dummies[0], 1.8);
    const events = run(15, [act('lightAttack')]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'combat:hit', attackerId: hero.id, targetId: dummies[0].id, amount: 10, kind: 'light' }));
    expect(dummies[0].health!.current).toBe(50);
  });

  it('misses a target behind the hero', () => {
    const { dummies, run, act, faceDummy, hero } = arena();
    faceDummy(dummies[0], 1.8);
    hero.rotationY = Math.PI; // turn away
    run(15, [act('lightAttack')]);
    expect(dummies[0].health!.current).toBe(dummies[0].health!.max);
  });

  it('a heavy attack hits harder', () => {
    const { dummies, run, act, faceDummy } = arena();
    faceDummy(dummies[0], 2);
    run(30, [act('heavyAttack')]);
    expect(dummies[0].health!.current).toBe(60 - 24);
  });

  it('dummies refill a few seconds after the last hit and never despawn', () => {
    const { world, dummies, run } = arena();
    const { ctx } = createSimContext(world, true);
    applyDamage(ctx, dummies[0].id, 999, null, 'light');
    expect(dummies[0].health!.current).toBe(0);
    run(100);
    expect(world.entities[dummies[0].id].health!.current).toBe(60);
  });

  it('i-frames make a hero evade damage', () => {
    const { world, hero } = arena();
    const { ctx, events } = createSimContext(world, true);
    hero.hero.iframes = 3;
    expect(applyDamage(ctx, hero.id, 20, null, 'light')).toBe(0);
    expect(events[0].type).toBe('combat:evaded');
    hero.hero.iframes = 0;
    expect(applyDamage(ctx, hero.id, 20, null, 'light')).toBe(20);
    expect(hero.hero.hurtTicks).toBeGreaterThan(0);
  });

  it('targetsInArc respects range and arc, nearest first', () => {
    const { world, hero, dummies, faceDummy } = arena();
    faceDummy(dummies[0], 2);
    expect(targetsInArc(world, hero, 2.6, 70)).toEqual([dummies[0].id]);
    expect(targetsInArc(world, hero, 1, 70)).toEqual([]);
  });
});

describe('Chain Lightning (Q)', () => {
  it('chains through the dummies with weakening damage and goes on cooldown', () => {
    const { hero, dummies, run, act, faceDummy } = arena();
    faceDummy(dummies[0], 3);
    const events = run(1, [act('godAbility')]);
    const cast = events.find((e) => e.type === 'ability:cast');
    expect(cast).toMatchObject({ casterId: hero.id, abilityId: 'chain-lightning' });
    const hits = events.filter((e) => e.type === 'combat:hit');
    expect(hits.length).toBe(3); // three dummies within chain range of each other
    // Pipeline: 18 × 0.8^jump, × 1.25 because the starter spear's element (lightning)
    // matches the ability, × 2 on the Light dummy (lightning beats light).
    const expected = hits.map((h, i) => {
      const target = dummies.find((d) => d.id === (h as { targetId: string }).targetId)!;
      return Math.round(18 * 0.8 ** i * 1.25 * (target.element === 'light' ? 2 : 1));
    });
    expect(hits.map((h) => (h as { amount: number }).amount)).toEqual(expected);
    expect(hits.some((h) => (h as { multiplier: number }).multiplier === 2.5)).toBe(true);
    expect(hero.hero.cooldowns['chain-lightning']).toBe(8); // 0.3 s fire rate, one tick already counted down

    const again = run(1, [act('godAbility')]);
    expect(again).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'cooling down' }));
  });

  it('with nothing in range it still fires, striking the ground ahead (M3.1)', () => {
    const { world, hero, run, act } = arena();
    for (const e of Object.values(world.entities)) if (e.creature) e.position = { x: 100, y: 0, z: 100 };
    const stamina = hero.stamina!.current;
    const events = run(1, [act('godAbility')]);
    const cast = events.find((e) => e.type === 'ability:cast') as { points: Array<{ x: number; z: number }>; targetIds: string[] } | undefined;
    expect(cast).toBeDefined();
    expect(cast!.targetIds).toEqual([]);
    const end = cast!.points[cast!.points.length - 1];
    expect(Math.hypot(end.x - hero.position.x, end.z - hero.position.z)).toBeCloseTo(14, 0);
    expect(hero.hero.cooldowns['chain-lightning']).toBeGreaterThan(0);
    expect(hero.stamina!.current).toBe(stamina - 8);
  });

  it('lock-on picks a target and Q prefers it', () => {
    const { hero, dummies, run, act, faceDummy } = arena();
    faceDummy(dummies[2], 3);
    run(1, [act('lockOn')]);
    expect(hero.hero.lockTarget).toBe(dummies[2].id);
    const events = run(1, [act('godAbility')]);
    expect(events.find((e) => e.type === 'ability:cast')).toMatchObject({ targetIds: expect.arrayContaining([dummies[2].id]) });
    expect((events.find((e) => e.type === 'ability:cast') as { targetIds: string[] }).targetIds[0]).toBe(dummies[2].id);
    run(1, [act('lockOn')]);
    expect(hero.hero.lockTarget).toBeNull();
  });
});
