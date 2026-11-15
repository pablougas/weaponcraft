import { describe, expect, it } from 'vitest';
import { HOWL } from '../content/spirits/cerberus';
import { applyDamage } from './combat';
import { findPoseidon, FREED_BEATS, FREED_ID, freedPoints } from './cutscenes/freed';
import { WARDEN_BEATS, WARDEN_ID } from './cutscenes/warden';
import { findWarden, FREED_DELAY, WARDEN } from './systems/warden';
import type { Intent } from './intents';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { findMech, MECH } from './systems/mech';
import { FORT_SPOTS, MECH_SIZE, MECH_WATCH } from './terrain/underworld';
import { RESET_FADE } from './systems/restart';
import { REST_TOTAL } from './systems/rest';
import { restartGarrison } from './systems/soldiers';
/** Soldiers per fort (systems/soldiers.ts FORT_GARRISONS). */
const FORT_GARRISON_SIZES = [3, 4, 5];
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

  it('only the rear plating can be hurt; breaking it brings out the Warden; beating him frees Cerberus, reunites him with Hades and brings Poseidon (E: Three-Fold Howl)', () => {
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

    // Breaking the plating: the Mk. II powers down and the Warden climbs out (first time: not skippable).
    plating().health!.current = 0;
    const events = run([], 2);
    expect(events.some((e) => e.type === 'mech:down')).toBe(true);
    expect(mech().mech.mode).toBe('down');
    expect(world.cutscene?.id).toBe(WARDEN_ID);
    expect(world.cutscene?.skippable).toBe(false);
    // F on the chains now: the Warden isn't beaten yet (after the scene).
    run([], WARDEN_BEATS.end + 2);
    expect(world.cutscene).toBeNull();
    const warden = findWarden(world)!;
    expect(warden.warden.mode).toBe('fight');
    expect(world.objective).toBe('defeat-the-warden');
    const chains = Object.values(world.entities).find((e) => e.structure?.kind === 'chains')!;
    const toChains = () => run([{ type: 'dev:teleport', playerId: 'p1', x: chains.position.x + 1, z: chains.position.z, rotationY: 0 }], 1);
    warden.position = { ...warden.position, x: warden.position.x + 200 }; // (out of the way for this check)
    toChains();
    const early = run([{ type: 'player:action', playerId: 'p1', action: 'interact' }]);
    expect(early.some((e) => e.type === 'chains:examined' && e.reason === 'warden')).toBe(true);

    // He falls; a moment later the chains break on their own: Hades and Cerberus are reunited, then Poseidon arrives.
    warden.health.current = 0;
    const fell = run([], 2);
    expect(fell.some((e) => e.type === 'warden:defeated')).toBe(true);
    run([], FREED_DELAY + 2);
    expect(world.cutscene?.id).toBe(FREED_ID);
    const rest = run([], FREED_BEATS.end + 2);
    expect(rest.some((e) => e.type === 'spirit:freed' && e.spiritId === 'cerberus')).toBe(true);
    expect(rest.some((e) => e.type === 'cutscene:beat' && e.beat === 'linePoseidon1')).toBe(true);
    expect(world.flags.cerberusFreed).toBe(true);
    expect(world.objective).toBe('brothers-reunited');
    expect(world.cutscene).toBeNull();
    // Poseidon stays at the Gates; Hades stands with Cerberus.
    const poseidon = findPoseidon(world)!;
    expect(poseidon.npc?.name).toBe('Poseidon');
    const hades = Object.values(world.entities).find((e) => e.defId === 'hades' && e.hero)!;
    expect(Math.hypot(hades.position.x - freedPoints().reunion.x, hades.position.z - freedPoints().reunion.z)).toBeLessThan(0.5);

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

describe('the Warden (M7 boss)', () => {
  function fight() {
    const g = atTheGates();
    g.plating().health!.current = 0;
    g.run([], 2);
    g.run([], WARDEN_BEATS.end + 2);
    return { ...g, warden: () => findWarden(g.world)! };
  }

  it('climbs out of the broken Mk. II, then runs at you faster than a god walks', () => {
    const { world, run, zeus, warden } = fight();
    expect(warden().warden.mode).toBe('fight');
    expect(warden().health.max).toBe(WARDEN.health);
    // Zeus 20 m away: the Warden closes the gap at his run speed (faster than Zeus walks).
    const w = warden();
    const away = { x: w.position.x + 20, z: w.position.z };
    run([{ type: 'dev:teleport', playerId: 'p1', x: away.x, z: away.z, rotationY: 0 }], 1);
    w.warden.leapReady = 999;
    w.warden.dashReady = 999;
    const before = Math.hypot(zeus().position.x - w.position.x, zeus().position.z - w.position.z);
    run([], 30);
    const after = Math.hypot(zeus().position.x - warden().position.x, zeus().position.z - warden().position.z);
    expect(before - after).toBeGreaterThan(5.8);
    expect(world.cutscene).toBeNull();
  });

  it('every attack has a visible wind-up: the maul lands after its warning, and hurts', () => {
    const { run, zeus, warden } = fight();
    const w = warden();
    const near = () => run([{ type: 'dev:teleport', playerId: 'p1', x: w.position.x + Math.sin(w.rotationY) * 3, z: w.position.z + Math.cos(w.rotationY) * 3, rotationY: w.rotationY + Math.PI }], 1);
    w.warden.cooldown = 0;
    const before = zeus().health!.current;
    let windupTick = -1;
    let hitTick = -1;
    for (let t = 0; t < 90 && hitTick < 0; t += 1) {
      for (const e of near()) {
        if (e.type === 'warden:windup' && windupTick < 0) windupTick = t;
        if (e.type === 'combat:hit' && e.targetId === zeus().id && e.attackerId === w.id) hitTick = t;
      }
    }
    expect(windupTick).toBeGreaterThanOrEqual(0);
    expect(hitTick - windupTick).toBeGreaterThanOrEqual(WARDEN.swing.windup - 1);
    expect(zeus().health!.current).toBeLessThan(before);
  });

  it('rages below half health (shorter warnings), and leaps at you from range with the landing marked', () => {
    const { run, warden } = fight();
    const w = warden();
    w.health.current = w.health.max * 0.4;
    const raged = run([], 1);
    expect(raged.some((e) => e.type === 'warden:enraged')).toBe(true);
    // 15 m away, leap ready: he crouches and the landing point is announced.
    w.warden.leapReady = 0;
    w.warden.cooldown = 0;
    w.warden.attack = null;
    let leap: { ticks: number } | undefined;
    for (let t = 0; t < 20 && !leap; t += 1) {
      // (The first tick is the teleport itself; its events count too.)
      const tick = t === 0
        ? run([{ type: 'dev:teleport', playerId: 'p1', x: w.position.x + Math.sin(w.rotationY) * 15, z: w.position.z + Math.cos(w.rotationY) * 15, rotationY: 0 }], 1)
        : run([], 1);
      const e = tick.find((x) => x.type === 'warden:windup' && x.kind === 'leap');
      if (e && e.type === 'warden:windup') leap = e;
    }
    expect(leap).toBeDefined();
    expect(leap!.ticks).toBeLessThan(WARDEN.leap.windup);
    expect(leap!.ticks).toBeGreaterThanOrEqual(Math.round(WARDEN.leap.windup * WARDEN.rageWindup));
  });
});

describe('starting the level over (falling, or "Reset level")', () => {
  it('Reset level: fade, wake at the bed healed, and every enemy starts over (cleared forts refilled)', () => {
    const { world, run, zeus, mech, plating } = atTheGates();
    // Put the soldiers back (atTheGates removes them) as the real game has them.
    world.flags.garrisonPlaced = true;
    restartGarrison(createSimContext(world, true).ctx);
    const soldiers = () => Object.values(world.entities).filter((e) => e.soldier);
    const total = soldiers().length;
    // Mess things up: a soldier dead, the rest on alert; a fort cleared; the Mk. II hunting with its plating worn.
    const fortId = FORT_SPOTS[0].id;
    for (const s of soldiers()) {
      s.soldier!.state = 'attack';
      s.soldier!.awareness = 100;
    }
    soldiers().filter((s) => s.soldier!.fortId === fortId).forEach((s) => { delete world.entities[s.id]; });
    world.forts[fortId].cleared = true;
    const victim = soldiers().find((s) => s.soldier!.squadId)!;
    delete world.entities[victim.id];
    mech().mech.mode = 'attack';
    mech().mech.awareness = 100;
    plating().health!.current = 100;
    zeus().health!.current = 30;

    const events = run([{ type: 'player:resetLevel', playerId: 'p1' }], RESET_FADE + 3);
    expect(events.some((e) => e.type === 'level:reset')).toBe(true);
    // At the bed, healed (in the grotto).
    expect(zeus().hero!.rest).not.toBeNull();
    run([], REST_TOTAL);
    expect(zeus().health!.current).toBe(zeus().health!.max);
    expect(Math.hypot(zeus().position.x - GROTTO.center.x, zeus().position.z - GROTTO.center.z)).toBeLessThan(20);
    // Soldiers: all back (the cleared fort's too), calm, at their posts.
    expect(soldiers().every((s) => s.soldier!.state === 'patrol' && s.soldier!.awareness < 25)).toBe(true);
    expect(soldiers().length).toBe(total);
    expect(world.forts[fortId].cleared).toBe(false);
    // The Mk. II is back on watch with its plating whole.
    expect(mech().mech.mode).toBe('patrol');
    expect(plating().health!.current).toBe(MECH.plating);
  });

  it('falling in battle starts every enemy over too: a beaten Mk. II stands again and the Warden goes back inside', () => {
    const { world, run, zeus, mech, plating } = atTheGates();
    plating().health!.current = 0;
    run([], 2);
    run([], WARDEN_BEATS.end + 2);
    const warden = findWarden(world)!;
    warden.health.current = 200;
    zeus().health!.current = 0;
    const events = run([], 120);
    expect(events.some((e) => e.type === 'level:reset' && e.reason === 'fell')).toBe(true);
    expect(findWarden(world)).toBeUndefined();
    expect(world.flags.wardenEmerged).toBe(false);
    expect(mech().mech.mode).toBe('patrol');
    expect(plating().health!.current).toBe(MECH.plating);
    expect(world.objective).toBe('find-and-free-cerberus');
    // Break it again: the Warden climbs out again.
    plating().health!.current = 0;
    run([], 2);
    expect(world.cutscene?.id).toBe(WARDEN_ID);
  });

});

describe('Skull Cage and Three-Fold Howl (team tuning, Nov 15)', () => {
  it('Skull Cage slams and crushes what is inside, holds even the Warden briefly, and recovers in 8 s', async () => {
    const { skullCage } = await import('../content/gods/hades/skull-cage');
    expect(skullCage.cooldownTicks).toBe(240);
    const { world, run, plating } = atTheGates();
    plating().health!.current = 0;
    run([], 2);
    run([], WARDEN_BEATS.end + 2);
    const warden = findWarden(world)!;
    const before = warden.health.current;
    const { ctx } = createSimContext(world, true);
    const zeus = world.entities[world.players.p1.entityId!];
    skullCage.land(ctx, zeus.id, { ...warden.position }, 100);
    // The slam lands at once; the crush keeps going.
    expect(warden.health.current).toBeLessThanOrEqual(before - 60);
    const pos = { ...warden.position };
    run([], 30);
    expect(Math.hypot(warden.position.x - pos.x, warden.position.z - pos.z)).toBeLessThan(0.05);
    expect(warden.health.current).toBeLessThan(before - 60);
  });

  it('Three-Fold Howl leaves dread: enemies in range keep taking damage for a few seconds', async () => {
    const { world, run, zeus, plating, near } = atTheGates();
    world.flags.cerberusFreed = true;
    near(MECH_SIZE.halfZ + 3, Math.PI);
    zeus().stamina!.current = zeus().stamina!.max;
    const before = plating().health!.current;
    run([{ type: 'player:action', playerId: 'p1', action: 'spiritAbility' }]);
    expect(plating().statuses?.some((s) => s.kind === 'dread')).toBe(true);
    run([], 4 * 30 + 2);
    expect(plating().health!.current).toBeLessThanOrEqual(before - 4 * HOWL.dreadPerSecond);
  });
});
