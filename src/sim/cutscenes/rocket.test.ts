import { describe, expect, it } from 'vitest';
import type { Intent } from '../intents';
import { ensureMeadowPopulated } from '../populate';
import { deserialize, serialize } from '../serialize';
import { tickWorld } from '../tick';
import { getWorldTime } from '../time';
import { nextTutorialStep, TUTORIAL_STEPS } from '../tutorial';
import { createWorld } from '../world';
import { ROCKET_BEATS, ROCKET_ID } from './rocket';

function prologue(seenRocket = false) {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  if (seenRocket) run([{ type: 'player:declare', playerId: 'p1', seenRocket: true }]);
  const completeAll = () => run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  const hero = () => world.entities[world.players.p1.entityId!];
  return { world, run, completeAll, hero };
}

describe('prologue tutorial', () => {
  it('steps are taught in order and done by doing them', () => {
    const { world, run, hero } = prologue();
    expect(nextTutorialStep(world)).toBe('move');
    // Walk for 2 s → move; sprint for 1 s → sprint.
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1, sprint: false, jumpHeld: false }], 70);
    expect(world.tutorial.done).toContain('move');
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1, sprint: true, jumpHeld: false }], 40);
    expect(world.tutorial.done).toContain('sprint');
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: 0, sprint: false, jumpHeld: false }], 45); // stop and land (he walked off the rock)
    const events = run([{ type: 'player:action', playerId: 'p1', action: 'jump' }], 2);
    expect(events).toContainEqual(expect.objectContaining({ type: 'tutorial:step', stepId: 'jump', next: 'attack' }));
    expect(hero().hero!.grounded === false || world.tutorial.done.includes('jump')).toBe(true);
  });

  it('the rocket starts the tick after the last step, and only once every step is done', () => {
    const { world, run } = prologue();
    run(TUTORIAL_STEPS.slice(0, -1).map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([], 5);
    expect(world.cutscene).toBeNull();
    const events = run([{ type: 'dev:tutorial', playerId: 'p1', stepId: 'fuse' }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'cutscene:start', cutsceneId: ROCKET_ID, skippable: false }));
    expect(world.cutscene).toMatchObject({ id: ROCKET_ID });
  });
});

describe('the rocket cinematic', () => {
  it('locks input, shatters the summit at impact, then hands control back as the Refuge', () => {
    const { world, run, completeAll, hero } = prologue();
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1, sprint: true, jumpHeld: false }]); // held when it starts
    completeAll();
    expect(hero().hero!.move).toEqual({ x: 0, z: 0 });
    const start = { ...hero().position };
    // Player input during the cutscene is ignored.
    const ignored = run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: true, jumpHeld: false }, { type: 'player:action', playerId: 'p1', action: 'blink' }], 30);
    expect(ignored.filter((e) => e.type === 'intent:rejected').every((e) => (e as { reason: string }).reason === 'cutscene active')).toBe(true);
    expect(Math.hypot(hero().position.x - start.x, hero().position.z - start.z)).toBeLessThan(0.05);

    run([], ROCKET_BEATS.impact - 31);
    expect(world.flags.olympusShattered).toBe(false);
    const impact = run([], 2);
    expect(world.flags.olympusShattered).toBe(true);
    expect(world.olympusShatteredAtMs).not.toBeNull();
    expect(impact).toContainEqual(expect.objectContaining({ type: 'cutscene:beat', beat: 'impact' }));
    // Still the prologue (golden hour) until the cinematic ends.
    expect(getWorldTime(world.nowMs, { lock: 'live', prologue: !world.flags.prologueDone }).source).toBe('prologue');

    const end = run([], ROCKET_BEATS.end);
    expect(end).toContainEqual(expect.objectContaining({ type: 'cutscene:end', skipped: false }));
    expect(world).toMatchObject({ cutscene: null, objective: 'find-the-others', flags: { prologueDone: true, olympusShattered: true, refugeBuilt: true } });
    expect(Object.values(world.entities).map((e) => e.structure?.kind).filter(Boolean).sort()).toEqual(['bed', 'forge', 'fusion-altar']);
    expect(world.players.p1.seenRocket).toBe(true);
    // Control is back: moving works again.
    run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: false, jumpHeld: false }], 20);
    expect(Math.hypot(hero().position.x - start.x, hero().position.z - start.z)).toBeGreaterThan(1);
  });

  it('is unskippable the first time, skippable for players who have seen it', () => {
    const first = prologue();
    first.completeAll();
    expect(first.run([{ type: 'cutscene:skip', playerId: 'p1' }])).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'not skippable the first time' }));
    expect(first.world.cutscene).not.toBeNull();

    const again = prologue(true);
    again.completeAll();
    expect(again.world.cutscene?.skippable).toBe(true);
    const events = again.run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'cutscene:end', skipped: true }));
    expect(again.world).toMatchObject({ cutscene: null, flags: { olympusShattered: true, prologueDone: true }, objective: 'find-the-others' });
  });

  it('a save made mid-cinematic resumes it, and older saves load with an empty tutorial', () => {
    const { world, run, completeAll } = prologue();
    completeAll();
    run([], 50);
    const restored = deserialize(serialize(world));
    expect(restored.cutscene).toMatchObject({ id: ROCKET_ID, startTick: world.cutscene!.startTick });
    const old = JSON.parse(serialize(createWorld(1, 0)));
    delete old.world.tutorial;
    delete old.world.objective;
    delete old.world.olympusShatteredAtMs;
    expect(deserialize(JSON.stringify(old))).toMatchObject({ tutorial: { done: [] }, objective: null, olympusShatteredAtMs: null });
  });

  it('the bed heals and the Forge answers', () => {
    const { world, run } = prologue(true);
    run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    const bed = Object.values(world.entities).find((e) => e.structure?.kind === 'bed')!;
    const hero = world.entities[world.players.p1.entityId!];
    hero.health!.current = 20;
    run([{ type: 'dev:teleport', playerId: 'p1', x: bed.position.x + 1.4, z: bed.position.z }]);
    const events = run([{ type: 'player:action', playerId: 'p1', action: 'interact' }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hero:rested' }));
    expect(hero.health!.current).toBe(hero.health!.max);
  });
});
