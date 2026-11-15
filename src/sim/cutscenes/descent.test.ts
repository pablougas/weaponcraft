import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../../engine/physics';
import type { Intent } from '../intents';
import { PhysicsWorld, type Rapier } from '../physics';
import { ensureMeadowPopulated, ensureStory } from '../populate';
import { GROTTO } from '../regions';
import { deserialize, serialize } from '../serialize';
import { tickWorld } from '../tick';
import { TUTORIAL_STEPS } from '../tutorial';
import { createWorld } from '../world';
import { DESCENT_BEATS, DESCENT_ID, GROTTO_SPOTS } from './descent';
import { ROCKET_BEATS } from './rocket';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

function story(options: { physics?: boolean; seen?: string[] } = {}) {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  const physics = options.physics ? new PhysicsWorld(R) : undefined;
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [], physics }));
    return events;
  };
  if (options.seen) run([{ type: 'player:declare', playerId: 'p1', seenRocket: options.seen.includes('rocket'), seenCutscenes: options.seen }]);
  const toDescent = () => {
    run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([], ROCKET_BEATS.end + 1);
  };
  const zeus = () => world.entities[world.players.p1.entityId!];
  const hades = () => Object.values(world.entities).find((e) => e.defId === 'hades');
  return { world, run, toDescent, zeus, hades };
}

describe('the descent (M5.1)', () => {
  it('Hades arrives, takes Zeus to the Outer Grotto, and the objective is to find and free Cerberus', () => {
    const { world, run, toDescent, zeus, hades } = story();
    toDescent();
    expect(world.cutscene).toMatchObject({ id: DESCENT_ID, skippable: false });
    expect(hades()).toBeUndefined();

    // Hades steps out of the portal on the surface.
    run([], DESCENT_BEATS.hades + 1);
    expect(hades()).toMatchObject({ npc: { name: 'Hades' }, region: 'surface' });
    // Input stays locked the whole way.
    const startPos = { ...zeus().position };
    const rejected = run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: false, jumpHeld: false }], 30);
    expect(rejected).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'cutscene active' }));
    expect(Math.hypot(zeus().position.x - startPos.x, zeus().position.z - startPos.z)).toBeLessThan(0.05);

    // Through the portal: both gods are in the grotto, which is now the Refuge.
    run([], DESCENT_BEATS.arrive - world.tick + world.cutscene!.startTick + 1);
    expect(zeus()).toMatchObject({ region: 'underworld' });
    expect(zeus().position.y).toBeCloseTo(GROTTO.center.y, 3);
    expect(hades()).toMatchObject({ region: 'underworld' });
    expect(world.flags.descended).toBe(true);
    const grottoKinds = Object.values(world.entities).filter((e) => e.region === 'underworld' && e.structure).map((e) => e.structure!.kind).sort();
    expect(grottoKinds).toEqual(['barricade', 'bed', 'dispatch', 'fusion-altar']);

    const events = run([], DESCENT_BEATS.end);
    expect(events).toContainEqual(expect.objectContaining({ type: 'cutscene:beat', beat: 'dispatch' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'objective:set', objectiveId: 'find-and-free-cerberus' }));
    expect(world).toMatchObject({ cutscene: null, objective: 'find-and-free-cerberus', flags: { prologueDone: true, descended: true } });
    // The meadow never became the Refuge in this story.
    expect(world.flags.refugeBuilt).toBeFalsy();
  });

  it('the story state survives a save, mid-descent and after', () => {
    const { world, run, toDescent } = story();
    toDescent();
    run([], 120);
    const mid = deserialize(serialize(world));
    expect(mid.cutscene).toMatchObject({ id: DESCENT_ID, points: { portalUp: expect.any(Object) } });
    run([], DESCENT_BEATS.end);
    const after = deserialize(serialize(world));
    expect(after).toMatchObject({ objective: 'find-and-free-cerberus', flags: { descended: true, grottoBuilt: true } });
    expect(after.entities[after.players.p1.entityId!].region).toBe('underworld');
  });

  it('is skippable once seen, landing in the grotto with the objective', () => {
    const { world, run, toDescent, zeus } = story({ seen: ['rocket', 'descent'] });
    run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    expect(world.cutscene).toMatchObject({ id: DESCENT_ID, skippable: true });
    run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    expect(world).toMatchObject({ cutscene: null, objective: 'find-and-free-cerberus', flags: { descended: true } });
    expect(zeus().region).toBe('underworld');
    void toDescent;
  });

  it('an older save that ended in the meadow Refuge continues into the descent on load', () => {
    const { world } = story();
    world.flags.olympusShattered = true;
    world.flags.prologueDone = true;
    world.objective = 'find-the-others';
    const restored = deserialize(serialize(world));
    const events = ensureStory(restored);
    expect(events).toContainEqual(expect.objectContaining({ type: 'cutscene:start', cutsceneId: DESCENT_ID }));
    expect(ensureStory(restored)).toEqual([]);
  });
});

describe('the Outer Grotto (with physics)', () => {
  it('stays on its floor, its walls and barricade hold, and the props answer F', () => {
    const { world, run, zeus } = story({ physics: true, seen: ['rocket', 'descent'] });
    run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    run([{ type: 'cutscene:skip', playerId: 'p1' }], 5);
    expect(zeus().region).toBe('underworld');

    // Walk north into the barricaded tunnel for 4 s: blocked, never under the floor.
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1, sprint: true, jumpHeld: false }], 120);
    expect(zeus().position.z - GROTTO.center.z).toBeGreaterThan(GROTTO_SPOTS.barricade.z - 0.2);
    expect(zeus().position.y).toBeGreaterThan(GROTTO.center.y - 0.3);
    expect(zeus().hero!.grounded).toBe(true);
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'barricade:examined' }));

    // Walk east for 6 s: the rock wall holds it inside the grotto.
    run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: true, jumpHeld: false }], 180);
    expect(Math.hypot(zeus().position.x - GROTTO.center.x, zeus().position.z - GROTTO.center.z)).toBeLessThan(GROTTO.radius + 1.5);
    expect(zeus().position.y).toBeGreaterThan(GROTTO.center.y - 0.3);

    // The dispatch and Hades answer F.
    const at = (x: number, z: number) => run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x + x, z: GROTTO.center.z + z }], 2);
    at(GROTTO_SPOTS.dispatch.x + 1, GROTTO_SPOTS.dispatch.z + 1);
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'dispatch:read' }));
    at(GROTTO_SPOTS.hades.x - 1.4, GROTTO_SPOTS.hades.z + 0.5);
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'npc:talk', name: 'Hades' }));
    // The grotto's bed heals.
    zeus().health!.current = 30;
    at(GROTTO_SPOTS.bed.x - 1.4, GROTTO_SPOTS.bed.z);
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'hero:rested' }));
    expect(zeus().health!.current).toBe(zeus().health!.max);
    void world;
  });
});
