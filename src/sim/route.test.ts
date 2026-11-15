import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../engine/physics';
import { BARRICADE_HEALTH } from './cutscenes/descent';
import type { Intent } from './intents';
import { PhysicsWorld, type Rapier } from './physics';
import { ensureMeadowPopulated } from './populate';
import { GROTTO, groundAt } from './regions';
import { deserialize, serialize } from './serialize';
import { FIELDS, TUNNEL } from './terrain/underworld';
import { tickWorld } from './tick';
import { createWorld } from './world';
import { TUTORIAL_STEPS } from './tutorial';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

function grotto() {
  const world = createWorldReady();
  const physics = new PhysicsWorld(R);
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [], physics }));
    return events;
  };
  run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
  run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  run([{ type: 'cutscene:skip', playerId: 'p1' }]);
  run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
  const zeus = () => world.entities[world.players.p1.entityId!];
  const local = () => ({ x: zeus().position.x - GROTTO.center.x, z: zeus().position.z - GROTTO.center.z });
  return { world, run, zeus, local };
}

function createWorldReady() {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  return world;
}

describe('the barricade and the route beyond (M6)', () => {
  it('attacking the barricade tears it down, and the tunnel leads out to the Asphodel Fields', () => {
    const { world, run, zeus, local } = grotto();
    const barricade = Object.values(world.entities).find((e) => e.structure?.kind === 'barricade')!;
    expect(barricade.health).toEqual({ current: BARRICADE_HEALTH, max: BARRICADE_HEALTH });

    // Stand in front of it and punch until it breaks.
    run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x, z: GROTTO.center.z - 16.6, rotationY: Math.PI }], 2);
    let broken = false;
    for (let i = 0; i < 200 && !broken; i += 1) {
      const events = run([{ type: 'player:action', playerId: 'p1', action: 'punch' }], 12);
      broken = events.some((e) => e.type === 'barricade:broken');
    }
    expect(broken).toBe(true);
    expect(world.flags.barricadeBroken).toBe(true);
    expect(world.entities[barricade.id]).toBeUndefined();
    expect(deserialize(serialize(world)).flags.barricadeBroken).toBe(true);

    // Walk north through the tunnel and out into the fields: always on the ground.
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1, sprint: true, jumpHeld: false }], 1);
    for (let i = 0; i < 30; i += 1) {
      run([], 10);
      const p = local();
      expect(zeus().position.y).toBeGreaterThan(groundAt('underworld', zeus().position.x, zeus().position.z) - 0.3);
      expect(Math.abs(p.x)).toBeLessThan(FIELDS.maxX);
    }
    expect(local().z).toBeLessThan(TUNNEL.toZ - 20);
    expect(zeus().region).toBe('underworld');
  });

  it('the fields’ cliffs and edge keep you in', () => {
    const { run, zeus, local } = grotto();
    run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x + FIELDS.maxX - 40, z: GROTTO.center.z - 300 }], 2);
    run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: true, jumpHeld: false }], 300);
    expect(local().x).toBeLessThan(FIELDS.maxX - 10);
    expect(zeus().position.y).toBeGreaterThan(groundAt('underworld', zeus().position.x, zeus().position.z) - 0.3);
  });
});
