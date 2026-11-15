import { describe, expect, it } from 'vitest';
import { DAGGERS } from '../content/spirits/shadow-daggers';
import type { Intent } from './intents';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { tickWorld } from './tick';
import { TUTORIAL_STEPS } from './tutorial';
import type { Entity } from './types';
import { createSimContext, createWorld, spawn } from './world';

/** Hades under control in the grotto, Cerberus free, a sturdy target nearby. */
function withHades() {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
  run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  run([{ type: 'cutscene:skip', playerId: 'p1' }]);
  run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
  for (const e of Object.values(world.entities)) if (e.soldier) delete world.entities[e.id];
  world.flags.cerberusFreed = true;
  const press = (action: string) => run([{ type: 'player:action', playerId: 'p1', action } as Intent]);
  press('switchCharacter');
  run([], 2);
  const hades = () => world.entities[world.players.p1.entityId!];
  // Zeus stays out of it.
  world.players.p1.party = [hades().id];
  const { ctx } = createSimContext(world, true);
  const id = spawn(ctx, 'dummy-shadow', { position: { x: hades().position.x + 6, y: GROTTO.center.y, z: hades().position.z } });
  const target: Entity = world.entities[id];
  Object.assign(target, { region: 'underworld', body: { radius: 0.4, height: 1.8 }, health: { current: 1000, max: 1000 } });
  target.creature = { wanders: false, home: { ...target.position }, target: null, wait: 0, flee: 0, sinceHit: 0, hostile: false };
  hades().stamina!.current = hades().stamina!.max;
  return { world, run, press, hades, target };
}

describe('Shadow Daggers (Cerberus\'s gift to Hades, Nov 15)', () => {
  it('E summons three circling daggers for Hades instead of the howl; they wait until he focuses on an enemy', () => {
    const { run, press, hades, target } = withHades();
    expect(hades().defId).toBe('hades');
    const cast = press('spiritAbility');
    expect(cast).toContainEqual(expect.objectContaining({ type: 'ability:cast', abilityId: 'shadow-daggers' }));
    expect(cast.some((e) => e.type === 'ability:cast' && e.abilityId === 'three-fold-howl')).toBe(false);
    expect(hades().hero!.howl ?? 0).toBe(0);
    expect(hades().hero!.daggers).toMatchObject({ reform: [0, 0, 0] });
    expect(hades().hero!.cooldowns['shadow-daggers']).toBeGreaterThan(DAGGERS.cooldownTicks - 3);

    // No focus: nothing is thrown.
    const idle = run([], 30);
    expect(idle.some((e) => e.type === 'ability:cast' && e.abilityId === 'shadow-dagger')).toBe(false);
    expect(target.health!.current).toBe(1000);

    // Lock on: all three fly, one after another, and each hurts.
    hades().hero!.lockTarget = target.id;
    const volley = run([], DAGGERS.intervalTicks * 3);
    const throws = volley.filter((e) => e.type === 'ability:cast' && e.abilityId === 'shadow-dagger');
    expect(throws).toHaveLength(3);
    expect(throws.every((e) => (e as { targetIds: string[] }).targetIds[0] === target.id)).toBe(true);
    expect(target.health!.current).toBeLessThanOrEqual(1000 - 3 * DAGGERS.damage);
    expect(hades().hero!.daggers!.reform.every((r) => r > 0)).toBe(true);

    // They re-form and strike again while the focus holds.
    const again = run([], DAGGERS.reformTicks + 2);
    expect(again.some((e) => e.type === 'ability:cast' && e.abilityId === 'shadow-dagger')).toBe(true);
  });

  it('the daggers ignore targets out of range, end after 15 s, and survive a save', () => {
    const { world, run, press, hades, target } = withHades();
    press('spiritAbility');
    target.position.x = hades().position.x + DAGGERS.range + 4;
    hades().hero!.lockTarget = target.id;
    const far = run([], 10);
    expect(far.some((e) => e.type === 'ability:cast' && e.abilityId === 'shadow-dagger')).toBe(false);

    const restored = deserialize(serialize(world));
    expect(restored.entities[hades().id].hero!.daggers).toEqual(hades().hero!.daggers);

    run([], DAGGERS.durationTicks);
    expect(hades().hero!.daggers).toBeNull();
  });

  it('Zeus still howls on E', () => {
    const { world, run, press, hades } = withHades();
    world.players.p1.party = Object.values(world.entities).filter((e) => e.hero).map((e) => e.id);
    run([], 35); // V has a 1 s cooldown
    press('switchCharacter');
    run([], 2);
    expect(hades().defId).toBe('zeus');
    hades().stamina!.current = hades().stamina!.max;
    const cast = press('spiritAbility');
    expect(cast).toContainEqual(expect.objectContaining({ type: 'ability:cast', abilityId: 'three-fold-howl' }));
    expect(hades().hero!.daggers ?? null).toBeNull();
  });
});
