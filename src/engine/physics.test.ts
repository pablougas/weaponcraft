import { describe, expect, it } from 'vitest';
import { loadPhysics } from './physics';

describe('loadPhysics', () => {
  it('initializes the bundled Rapier WASM and steps a world', async () => {
    const RAPIER = await loadPhysics();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0));
    world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
    for (let i = 0; i < 30; i += 1) world.step();
    expect(body.translation().y).toBeLessThan(10);
    world.free();
  });

  it('returns the same module on repeated calls', async () => {
    expect(await loadPhysics()).toBe(await loadPhysics());
  });
});
