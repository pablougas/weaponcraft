import { describe, expect, it } from 'vitest';
import { HOWL } from '../content/spirits/cerberus';
import { applyDamage } from './combat';
import { FREED_BEATS, FREED_ID } from './cutscenes/freed';
import type { Intent } from './intents';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { findMech, MECH } from './systems/mech';
import { MECH_SIZE, MECH_WATCH } from './terrain/underworld';
import { tickWorld } from './tick';
import { TUTORIAL_STEPS } from './tutorial';
import type { Entity } from './types';
import { createSimContext, createWorld, spawn } from './world';

function atTheGates() {
  const world = createWorldInGrotto();
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
  run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  run([{ type: 'cutscene:skip', playerId: 'p1' }]);
  run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
  // Just the gods and the machine: no soldiers, and Hades parked on the surface.
  for (const e of Object.values(world.entities)) if (e.soldier) delete world.entities[e.id];
  world.players.p1.party = [world.players.p1.entityId!];
  Object.values(world.entities).find((e) => e.defId === 'hades')!.region = 'surface';
  const zeus = () => world.entities[world.players.p1.entityId!];
  const mech = () => findMech(world)!;
  const plating = () => world.entities[mech().mech.platingId!];
  /** Puts Zeus `d` metres from the mech's centre, at `bearing` relative to where its body faces (0 = in front). */
  const near = (d: number, bearing: number) => {
    const m = mech();
    const a = m.rotationY + bearing;
    const x = m.position.x + Math.sin(a) * d;
    const z = m.position.z + Math.cos(a) * d;
    // (The teleport takes one tick; its events are returned.)
    return run([{ type: 'dev:teleport', playerId: 'p1', x, z, rotationY: a + Math.PI }], 1);
  };
  return { world, run, zeus, mech, plating, near };
}

function createWorldInGrotto() {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  return world;
}

const flat = (a: Entity, b: Entity) => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

describe('Cerberus Mk. II (M7)', () => {
  it('stands watch at the Gates: walks its loop, sweeps its heads, carries its plating; survives a save', () => {
    const { world, run, mech, plating } = atTheGates();
    const start = { ...mech().position };
    const facings: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      run([], 30);
      facings.push(mech().mech.facing - mech().rotationY);
      const lx = mech().position.x - GROTTO.center.x - MECH_WATCH.x;
      const lz = mech().position.z - GROTTO.center.z - MECH_WATCH.z;
      expect(Math.hypot(lx, lz)).toBeLessThan(MECH.leash);
    }
    expect(Math.hypot(mech().position.x - start.x, mech().position.z - start.z)).toBeGreaterThan(8);
    // The heads look left and right of the way it walks.
    expect(Math.max(...facings) - Math.min(...facings)).toBeGreaterThan(0.8);
    expect(mech().mech.mode).toBe('patrol');
    // The plating rides on its back.
    const back = { x: -Math.sin(mech().rotationY), z: -Math.cos(mech().rotationY) };
    expect((plating().position.x - mech().position.x) * back.x + (plating().position.z - mech().position.z) * back.z).toBeGreaterThan(MECH_SIZE.halfZ);
    const restored = deserialize(serialize(world));
    expect(findMech(restored)?.mech.platingId).toBe(mech().mech.platingId);
  });

  it('a god in its sensor cone is spotted; sneaking up behind it is not', () => {
    const { mech, near } = atTheGates();
    // Heads held straight ahead for the test (they normally sweep).
    const holdHeads = () => { mech().mech.scan = 0; mech().mech.facing = mech().rotationY; };
    // Behind, 22 m back, out of the cone: unseen for 3 s.
    for (let i = 0; i < 90; i += 1) {
      holdHeads();
      near(22, Math.PI);
    }
    expect(mech().mech.awareness).toBe(0);
    expect(mech().mech.mode).toBe('patrol');
    // In front, in the cone: spotted within a second.
    let alarmed = false;
    for (let i = 0; i < 30 && !alarmed; i += 1) {
      holdHeads();
      alarmed = near(MECH_SIZE.halfZ + 15, 0).some((e) => e.type === 'mech:alarm');
    }
    expect(alarmed).toBe(true);
    expect(mech().mech.mode).toBe('attack');
  });

  it('warns at least 1.2 s before its stomp lands, and the stomp hurts', () => {
    const { zeus, mech, near } = atTheGates();
    mech().mech.facing = mech().rotationY;
    const before = zeus().health!.current;
    let windupTick = -1;
    let hitTick = -1;
    for (let t = 0; t < 150 && hitTick < 0; t += 1) {
      for (const e of near(MECH_SIZE.halfZ + 2, 0)) {
        if (e.type === 'mech:windup' && e.kind === 'stomp' && windupTick < 0) windupTick = t;
        if (e.type === 'combat:hit' && e.targetId === zeus().id && e.attackerId === mech().id) hitTick = t;
      }
      if (windupTick >= 0 && hitTick < 0) expect(zeus().health!.current).toBe(before);
    }
    expect(windupTick).toBeGreaterThanOrEqual(0);
    expect(hitTick - windupTick).toBeGreaterThanOrEqual(36);
    expect(zeus().health!.current).toBeLessThan(before);
  });

  it('once it spots you it charges: heads lowered for a second (the warning), then it runs you down', () => {
    const { run, zeus, mech, near } = atTheGates();
    // 30 m in front, heads held on Zeus until it spots him; then it charges.
    let windupTick = -1;
    let strikeTick = -1;
    let hitTick = -1;
    const start = { ...mech().position };
    for (let t = 0; t < 240 && hitTick < 0; t += 1) {
      if (windupTick < 0) {
        mech().mech.scan = 0;
        mech().mech.facing = mech().rotationY;
      }
      const events = windupTick < 0 ? near(30, 0) : run([], 1);
      for (const e of events) {
        if (e.type === 'mech:windup' && e.kind === 'charge' && windupTick < 0) windupTick = t;
        if (e.type === 'mech:strike' && e.kind === 'charge') strikeTick = t;
        if (e.type === 'combat:hit' && e.targetId === zeus().id && e.attackerId === mech().id) hitTick = t;
      }
    }
    expect(windupTick).toBeGreaterThanOrEqual(0);
    // A second's warning before it runs.
    expect(strikeTick - windupTick).toBeGreaterThanOrEqual(29);
    expect(hitTick).toBeGreaterThan(strikeTick);
    // It covered the ground fast (12 m/s).
    expect(Math.hypot(mech().position.x - start.x, mech().position.z - start.z)).toBeGreaterThan(12);
  });

  it('only the rear plating can be hurt; breaking it powers the Mk. II down and frees Cerberus (E: Three-Fold Howl)', () => {
    const { world, run, zeus, mech, plating, near } = atTheGates();
    // E does nothing before Cerberus is free.
    const rejected = run([{ type: 'player:action', playerId: 'p1', action: 'spiritAbility' }]);
    expect(rejected.some((e) => e.type === 'intent:rejected' && e.reason === 'no spirit')).toBe(true);

    // Punching its front does nothing to it.
    near(MECH_SIZE.halfZ + 1.5, 0);
    run([{ type: 'player:action', playerId: 'p1', action: 'punch' }], 20);
    expect(plating().health!.current).toBe(MECH.plating);

    // From behind, the plating takes the hits.
    near(MECH_SIZE.halfZ + 2.6, Math.PI);
    zeus().rotationY = Math.atan2(plating().position.x - zeus().position.x, plating().position.z - zeus().position.z);
    run([{ type: 'player:action', playerId: 'p1', action: 'punch' }], 20);
    expect(plating().health!.current).toBeLessThan(MECH.plating);

    // Finish it (as if the fight went on), then watch the scene through.
    plating().health!.current = 0;
    const events = run([], 2);
    expect(events.some((e) => e.type === 'mech:down')).toBe(true);
    expect(mech().mech.mode).toBe('down');
    expect(world.cutscene?.id).toBe(FREED_ID);
    expect(world.cutscene?.skippable).toBe(false);
    const rest = run([], FREED_BEATS.end + 2);
    expect(rest.some((e) => e.type === 'spirit:freed' && e.spiritId === 'cerberus')).toBe(true);
    expect(world.flags.cerberusFreed).toBe(true);
    expect(world.objective).toBe('cerberus-freed');
    expect(world.cutscene).toBeNull();

    // E now howls: lifesteal on what the god hits.
    zeus().stamina!.current = zeus().stamina!.max;
    const howl = run([{ type: 'player:action', playerId: 'p1', action: 'spiritAbility' }]);
    expect(howl.some((e) => e.type === 'ability:cast' && e.abilityId === 'three-fold-howl')).toBe(true);
    expect(zeus().hero!.howl).toBeGreaterThan(HOWL.lifestealTicks - 3);
    // And it cools down.
    const again = run([{ type: 'player:action', playerId: 'p1', action: 'spiritAbility' }]);
    expect(again.some((e) => e.type === 'intent:rejected' && e.reason === 'cooling down')).toBe(true);
    // The mech stays down.
    run([], 60);
    expect(mech().mech.mode).toBe('down');
    expect(flat(zeus(), mech())).toBeGreaterThan(0);
  });

  it('Three-Fold Howl sends nearby soldiers running and heals the god from the damage he deals', () => {
    const { world, run, zeus } = atTheGates();
    world.flags.cerberusFreed = true;
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'soldier-spear', { position: { ...zeus().position, x: zeus().position.x + 3 } });
    Object.assign(world.entities[id], {
      region: 'underworld', health: { current: 60, max: 60 }, body: { radius: 0.36, height: 1.8 },
      creature: { wanders: false, home: { ...zeus().position }, target: null, wait: 0, flee: 0, sinceHit: 0, hostile: true },
      soldier: { kind: 'spear', fortId: null, state: 'attack', awareness: 100, targetId: zeus().id, lastSeen: null, timer: 0, patrol: [], patrolIndex: 0, facing: 0, windup: 0, cooldown: 0, scan: 0 },
    } satisfies Partial<Entity>);
    zeus().stamina!.current = zeus().stamina!.max;
    run([{ type: 'player:action', playerId: 'p1', action: 'spiritAbility' }]);
    expect(world.entities[id].soldier!.state).toBe('flee');
    // Hurt, then hit something: the howl heals 30% of it.
    zeus().health!.current = 50;
    const dealt = applyDamage(createSimContext(world, true).ctx, id, 20, zeus().id, 'heavy');
    expect(zeus().health!.current).toBe(50 + Math.round(dealt * HOWL.lifesteal));
  });
});

describe('health regeneration', () => {
  it('a hurt god slowly heals once he has not been hit for 4 s', () => {
    const { run, zeus } = atTheGates();
    const z = zeus();
    z.health!.current = 40;
    z.hero!.regenDelay = 120;
    run([], 119);
    expect(z.health!.current).toBe(40);
    run([], 31);
    // About 2 a second.
    expect(z.health!.current).toBeGreaterThan(41.5);
    expect(z.health!.current).toBeLessThan(42.5);
  });
});
