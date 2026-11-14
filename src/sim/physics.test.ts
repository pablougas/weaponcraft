import { describe, expect, it } from 'vitest';
import { loadPhysics } from '../engine/physics';
import { PhysicsWorld } from './physics';
import { meadowHeightAt } from './terrain/meadow';
import { HERO_ROCK_TOP } from './terrain/meadow';

describe('PhysicsWorld', () => {
  it('the terrain collider matches the meadow height', async () => {
    const physics = new PhysicsWorld(await loadPhysics());
    physics.step();
    // Off the 2 m grid lines: a vertical ray exactly through a vertex can slip between triangles.
    for (const [x, z] of [[20.3, 30.7], [-40.3, 12.9], [60.5, -70.1], [-15.1, -35.3]]) {
      const ground = physics.groundBelow(x, 200, z)!;
      expect(Math.abs(ground - meadowHeightAt(x, z))).toBeLessThan(0.35);
    }
    expect(physics.groundBelow(0, 200, 0)!).toBeCloseTo(HERO_ROCK_TOP, 1);
    physics.free();
  });
});

describe('tree trunks', () => {
  it('block the hero: walking into a trunk never passes through it', async () => {
    const { MEADOW_TREES, trunkRadius } = await import('./terrain/meadow-trees');
    const { createWorld } = await import('./world');
    const { ensureMeadowPopulated } = await import('./populate');
    const { tickWorld } = await import('./tick');
    const physics = new PhysicsWorld(await loadPhysics());
    // A tree on fairly level ground near the middle of the meadow.
    const tree = [...MEADOW_TREES].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
      .find((t) => Math.abs(meadowHeightAt(t.x - 4, t.z) - meadowHeightAt(t.x, t.z)) < 1)!;
    const world = createWorld(1, 0);
    ensureMeadowPopulated(world);
    for (const e of Object.values(world.entities)) if (!e.hero) delete world.entities[e.id];
    tickWorld(world, { nowMs: 0, isAuthority: true, physics, intents: [{ type: 'dev:teleport', playerId: 'p1', x: tree.x - 4, z: tree.z }] });
    const hero = world.entities[world.players.p1.entityId!];
    let closest = Infinity;
    for (let t = 0; t < 60; t += 1) {
      tickWorld(world, { nowMs: 0, isAuthority: true, physics, intents: [{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: false, jumpHeld: false }] });
      closest = Math.min(closest, Math.hypot(hero.position.x - tree.x, hero.position.z - tree.z));
    }
    // Walking straight at the trunk: the hero may slide around it, but never through it.
    // (Without trunk colliders the closest approach is ~0 m.)
    expect(closest).toBeGreaterThan(trunkRadius(tree) + hero.body!.radius - 0.1);
    physics.free();
  });
});
