import { describe, expect, it } from 'vitest';
import { applyDamage } from './combat';
import { ensureMeadowPopulated, HERO_SPAWN } from './populate';
import { serialize } from './serialize';
import { tickWorld } from './tick';
import { createSimContext, createWorld } from './world';

const count = (world: ReturnType<typeof createWorld>, defId: string) => Object.values(world.entities).filter((e) => e.defId === defId).length;

describe('meadow population', () => {
  it('spawns each player\'s god on the rock, three dummies and five sheep', () => {
    const world = createWorld(1, 0, ['p1', 'p2']);
    const events = ensureMeadowPopulated(world);
    expect(count(world, 'zeus')).toBe(2);
    expect(count(world, 'practice-dummy')).toBe(3);
    expect(count(world, 'sheep')).toBe(5);
    const hero = world.entities[world.players.p1.entityId!];
    expect(hero).toMatchObject({ defId: 'zeus', ownerId: 'p1', position: { y: HERO_SPAWN.y }, health: { current: 100 }, stamina: { current: 100 } });
    // 2 gods, 3 dummies, 5 sheep, the Fusion Altar and 3 weapons to find.
    expect(events.filter((e) => e.type === 'entity:spawned')).toHaveLength(14);
    expect(count(world, 'fusion-altar')).toBe(1);
    expect(count(world, 'weapon-pickup')).toBe(3);
    expect(world.players.p1.inventory).toEqual(['starter-spear']);
    expect(ensureMeadowPopulated(world)).toEqual([]);
  });

  it('is deterministic per seed', () => {
    const a = createWorld(42, 0);
    const b = createWorld(42, 0);
    ensureMeadowPopulated(a);
    ensureMeadowPopulated(b);
    expect(serialize(a)).toBe(serialize(b));
    const c = createWorld(43, 0);
    ensureMeadowPopulated(c);
    expect(serialize(c)).not.toBe(serialize(a));
  });

  it('defeated sheep leave and new ones arrive over time', () => {
    const world = createWorld(5, 0);
    ensureMeadowPopulated(world);
    const { ctx } = createSimContext(world, true);
    const sheep = Object.values(world.entities).find((e) => e.defId === 'sheep')!;
    applyDamage(ctx, sheep.id, 999, null, 'light');
    tickWorld(world, { nowMs: 0, intents: [], isAuthority: true });
    expect(world.entities[sheep.id]).toBeUndefined();
    expect(count(world, 'sheep')).toBe(4);
    for (let t = 0; t < 460; t += 1) tickWorld(world, { nowMs: t, intents: [], isAuthority: true });
    expect(count(world, 'sheep')).toBe(5);
  });

  it('sheep wander and flee when hit', () => {
    const world = createWorld(9, 0);
    ensureMeadowPopulated(world);
    const sheep = Object.values(world.entities).find((e) => e.defId === 'sheep')!;
    const start = { ...sheep.position };
    for (let t = 0; t < 300; t += 1) tickWorld(world, { nowMs: t, intents: [], isAuthority: true });
    expect(Math.hypot(sheep.position.x - start.x, sheep.position.z - start.z)).toBeGreaterThan(0.5);
    const { ctx } = createSimContext(world, true);
    applyDamage(ctx, sheep.id, 5, null, 'light');
    expect(sheep.creature!.flee).toBeGreaterThan(0);
  });
});
