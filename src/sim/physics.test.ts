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
