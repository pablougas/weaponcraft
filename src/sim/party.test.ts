import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../engine/physics';
import { DESCENT_BEATS } from './cutscenes/descent';
import type { Intent } from './intents';
import { PhysicsWorld, type Rapier } from './physics';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { COMPANION_DOWN_TICKS } from './systems/rest';
import { tickWorld } from './tick';
import { TUTORIAL_STEPS } from './tutorial';
import type { Entity } from './types';
import { createWorld, createSimContext, spawn } from './world';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

/** A world where the descent is over: Zeus in the grotto with Hades in the party. */
function grotto(physics = false) {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  const phys = physics ? new PhysicsWorld(R) : undefined;
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [], physics: phys }));
    return events;
  };
  run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
  run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  run([{ type: 'cutscene:skip', playerId: 'p1' }]);
  run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
  const active = () => world.entities[world.players.p1.entityId!];
  const byDef = (defId: string) => Object.values(world.entities).find((e) => e.defId === defId && e.hero)!;
  const press = (action: string) => run([{ type: 'player:action', playerId: 'p1', action } as Intent]);
  /** A sturdy practice target in the grotto. */
  const target = (x: number, z: number, hostile = false): Entity => {
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'dummy-shadow', { position: { x: GROTTO.center.x + x, y: GROTTO.center.y, z: GROTTO.center.z + z } });
    const e = world.entities[id];
    Object.assign(e, { region: 'underworld', body: { radius: 0.4, height: 1.8 }, health: { current: 500, max: 500 } });
    e.creature = { wanders: false, home: { ...e.position }, target: null, wait: 0, flee: 0, sinceHit: 0, hostile };
    return e;
  };
  return { world, run, active, byDef, press, target };
}

describe('Hades joins and V switches (M6)', () => {
  it('after the descent Hades is in the party as a playable god; V switches with a 1 s cooldown', () => {
    const { world, run, active, byDef, press } = grotto();
    const hades = byDef('hades');
    expect(hades).toMatchObject({ hero: expect.any(Object), health: { max: 110 } });
    expect(hades.npc).toBeUndefined();
    expect(world.players.p1.party).toEqual([byDef('zeus').id, hades.id]);
    expect(active().defId).toBe('zeus');

    expect(press('switchCharacter')).toContainEqual(expect.objectContaining({ type: 'party:switched', defId: 'hades' }));
    expect(active().defId).toBe('hades');
    expect(press('switchCharacter')).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'cooling down' }));
    run([], 30);
    press('switchCharacter');
    expect(active().defId).toBe('zeus');
    // The selection survives a save.
    expect(deserialize(serialize(world)).players.p1).toMatchObject({ entityId: active().id, party: world.players.p1.party });
  });

  it('the companion follows 3–6 m behind, and catches up with a teleport when far behind', () => {
    const { run, active, byDef } = grotto(true);
    const hades = () => byDef('hades');
    run([{ type: 'player:move', playerId: 'p1', x: -1, z: 0, sprint: false, jumpHeld: false }], 75);
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: 0, sprint: false, jumpHeld: false }], 60);
    const gap = Math.hypot(hades().position.x - active().position.x, hades().position.z - active().position.z);
    expect(gap).toBeLessThan(6.5);
    expect(gap).toBeGreaterThan(1.5);
    // Teleport Zeus far away: Hades blinks after him.
    run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x - 10, z: GROTTO.center.z + 12 }]);
    hades().position = { x: GROTTO.center.x + 14, y: GROTTO.center.y, z: GROTTO.center.z - 14 };
    hades().region = 'surface';
    const events = run([], 3);
    expect(events).toContainEqual(expect.objectContaining({ type: 'ability:blink', casterId: hades().id }));
    expect(hades().region).toBe('underworld');
    expect(Math.hypot(hades().position.x - active().position.x, hades().position.z - active().position.z)).toBeLessThan(4);
  });

  it('the companion helps against hostiles near you, and is down 10 s then gets up near you', () => {
    const { run, active, byDef, target } = grotto();
    const enemy = target(-2, 4, true);
    const before = enemy.health!.current;
    run([], 120);
    expect(enemy.health!.current).toBeLessThan(before);
    const hades = byDef('hades');
    hades.health!.current = 0;
    expect(run([], 2)).toContainEqual(expect.objectContaining({ type: 'hero:down', entityId: hades.id }));
    const up = run([], COMPANION_DOWN_TICKS + 2);
    expect(up).toContainEqual(expect.objectContaining({ type: 'hero:revived', entityId: hades.id }));
    expect(hades.health!.current).toBe(55);
    expect(Math.hypot(hades.position.x - active().position.x, hades.position.z - active().position.z)).toBeLessThan(3);
  });
});

describe('Hades’s kit (M6)', () => {
  function asHades() {
    const g = grotto();
    g.press('switchCharacter');
    g.run([], 2);
    return g;
  }

  it('W Shadow Step reappears behind the lock-on target, leaves a decoy, and the next hit deals +50%', () => {
    const { world, run, active, press, target } = asHades();
    run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x, z: GROTTO.center.z + 6, rotationY: Math.PI }], 2);
    const dummy = target(0, 0);
    press('lockOn');
    expect(active().hero!.lockTarget).toBe(dummy.id);
    const blink = press('blink').concat(run([], 2));
    expect(blink).toContainEqual(expect.objectContaining({ type: 'ability:blink', abilityId: 'shadow-step' }));
    // Behind: on the far side of the dummy from where Hades started (z < dummy's z).
    expect(active().position.z).toBeLessThan(dummy.position.z - 0.5);
    expect(Object.values(world.entities).some((e) => e.decoy)).toBe(true);
    const ambushed = press('punch').concat(run([], 10));
    const hit = ambushed.find((e) => e.type === 'combat:hit' && e.targetId === dummy.id) as { multiplier: number } | undefined;
    expect(hit?.multiplier).toBeGreaterThanOrEqual(1.5);
    run([], 70);
    expect(Object.values(world.entities).some((e) => e.decoy)).toBe(false);
  });

  it('Q Soul Bolts damage and heal Hades; D roots in a ring; R warns 1.5 s before caging', () => {
    const { run, active, press, target } = asHades();
    const dummy = target(0, -3);
    run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x, z: GROTTO.center.z, rotationY: Math.PI }], 2);
    active().health!.current = 50;
    const q = press('godAbility').concat(run([], 2));
    expect(q).toContainEqual(expect.objectContaining({ type: 'ability:cast', abilityId: 'soul-bolts', targetIds: [dummy.id] }));
    expect(active().health!.current).toBeGreaterThan(50);

    run([], 30);
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: 0, sprint: false, jumpHeld: false, chargeHeld: true } as Intent], 20);
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: 0, sprint: false, jumpHeld: false, chargeHeld: false } as Intent], 15);
    expect(dummy.statuses?.some((s) => s.kind === 'stun')).toBe(true);

    run([], 90);
    active().stamina!.current = active().stamina!.max;
    press('lockOn');
    const r = press('ultimate');
    const telegraph = r.find((e) => e.type === 'ability:telegraph') as { ticks: number; abilityId: string } | undefined;
    expect(telegraph).toMatchObject({ abilityId: 'skull-cage' });
    expect(telegraph!.ticks).toBeGreaterThanOrEqual(45);
    expect(run([], 40).some((e) => e.type === 'ability:strike')).toBe(false);
    const landed = run([], 10);
    expect(landed).toContainEqual(expect.objectContaining({ type: 'ability:strike', abilityId: 'skull-cage' }));
    expect(dummy.statuses?.some((s) => s.kind === 'crush')).toBe(true);
  });
});
