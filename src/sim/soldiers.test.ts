import { describe, expect, it } from 'vitest';
import type { Intent } from './intents';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { ALARM_QUIET_TICKS, ALERT_AT, ensureGarrison, SENTRY_SQUADS } from './systems/soldiers';
import { FORT_SPOTS, SPIRES, underworldInside, underworldLocalHeight } from './terrain/underworld';
import { tickWorld } from './tick';
import { TUTORIAL_STEPS } from './tutorial';
import type { Entity } from './types';
import { createSimContext, createWorld, spawn } from './world';

function underworld() {
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
  const zeus = () => world.entities[world.players.p1.entityId!];
  const hades = () => Object.values(world.entities).find((e) => e.defId === 'hades')!;
  const soldiers = (fortId?: string) => Object.values(world.entities).filter((e) => e.soldier && !e.soldier.squadId && (!fortId || e.soldier.fortId === fortId));
  const squad = (id: string) => Object.values(world.entities).filter((e) => e.soldier?.squadId === id);
  const at = (x: number, z: number, rotationY = 0) => run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x + x, z: GROTTO.center.z + z, rotationY }], 1);
  /** Parks Hades (the companion) far away and asleep so he stays out of the test. */
  const parkHades = () => {
    world.players.p1.party = [world.players.p1.entityId!];
    hades().region = 'surface';
  };
  return { world, run, zeus, soldiers, squad, at, parkHades };
}

/** Puts a soldier facing a point (in grotto-local coordinates). */
function face(e: Entity, x: number, z: number) {
  e.soldier!.facing = Math.atan2(GROTTO.center.x + x - e.position.x, GROTTO.center.z + z - e.position.z);
  e.rotationY = e.soldier!.facing;
}

describe('forts and sentries (M6)', () => {
  it('places three forts (3, 4 and 5 soldiers, each with a chest) and six sentry squads, and they survive a save', () => {
    const { world, soldiers, squad } = underworld();
    expect(FORT_SPOTS.map((f) => soldiers(f.id).length)).toEqual([3, 4, 5]);
    // Three squads led by a captain (captain + 3 sentries), three of 3 sentries.
    expect(SENTRY_SQUADS.map((q) => squad(q.id).length)).toEqual(SENTRY_SQUADS.map((q) => q.sentries + (q.captain ? 1 : 0)));
    expect(Object.values(world.entities).filter((e) => e.soldier?.kind === 'captain')).toHaveLength(3);
    expect(Object.values(world.entities).filter((e) => e.structure?.kind === 'chest')).toHaveLength(3);
    expect(Object.keys(world.forts)).toHaveLength(3);
    const restored = deserialize(serialize(world));
    expect(Object.values(restored.entities).filter((e) => e.soldier)).toHaveLength(12 + 21);
  });

  it('sneaking up from behind goes unnoticed; standing in front gets you seen, attacked, and the fort roused', () => {
    const { world, run, zeus, soldiers, at, parkHades } = underworld();
    parkHades();
    const fort = FORT_SPOTS[0];
    const guard = soldiers(fort.id).find((s) => s.soldier!.kind === 'spear')!;
    const gx = guard.position.x - GROTTO.center.x;
    const gz = guard.position.z - GROTTO.center.z;
    // Freeze the guard's patrol for the test by giving it no route.
    guard.soldier!.patrol = [];
    guard.creature!.home = { ...guard.position };
    face(guard, gx, gz - 10);
    // Hold the rest of the fort still (stunned) while we test this one guard's eyes.
    const others = soldiers(fort.id).filter((x) => x.id !== guard.id);
    for (const o of others) o.creature!.stun = 1000;
    // 6 m behind it: not seen.
    at(gx, gz + 6);
    run([], 90);
    expect(guard.soldier!.state).toBe('patrol');
    expect(guard.soldier!.awareness).toBe(0);
    // 6 m in front: suspicious, then alert; it shouts and comes at Zeus.
    face(guard, gx, gz - 10);
    for (const o of others) o.creature!.stun = 0;
    at(gx, gz - 6);
    const events = run([], 60);
    expect(events).toContainEqual(expect.objectContaining({ type: 'soldier:alarm', entityId: guard.id }));
    expect(guard.soldier!.state).toBe('attack');
    expect(soldiers(fort.id).filter((s) => s.soldier!.state === 'attack').length).toBeGreaterThan(1);
    const before = zeus().health!.current;
    const fight = run([], 120);
    expect(fight).toContainEqual(expect.objectContaining({ type: 'soldier:windup' }));
    expect(zeus().health!.current).toBeLessThan(before);
    void world;
  });

  it('losing you and spotting you again doesn\'t sound the alarm over and over (team request, Nov 16)', () => {
    const { world, run, soldiers, at, parkHades } = underworld();
    parkHades();
    const fort = FORT_SPOTS[0];
    const guard = soldiers(fort.id).find((s) => s.soldier!.kind === 'spear')!;
    const gx = guard.position.x - GROTTO.center.x;
    const gz = guard.position.z - GROTTO.center.z;
    guard.soldier!.patrol = [];
    guard.creature!.home = { ...guard.position };
    face(guard, gx, gz - 10);
    at(gx, gz - 6);
    const alarms = (events: ReturnType<typeof run>) => events.filter((e) => e.type === 'soldier:alarm');
    expect(alarms(run([], 60)).length).toBeGreaterThanOrEqual(1);
    // It loses track of Zeus, then sees him again: back into the fight, quietly, again and again.
    for (let k = 0; k < 4; k += 1) {
      guard.soldier!.state = 'search';
      face(guard, gx, gz - 10);
      expect(alarms([...at(gx, gz - 6), ...run([], 20)])).toHaveLength(0);
      expect(guard.soldier!.state).toBe('attack');
    }
    // Long after the last alarm, a fresh sighting is heard again.
    for (const s of Object.values(world.entities)) if (s.soldier?.alarmedAt != null) s.soldier.alarmedAt -= ALARM_QUIET_TICKS + 1;
    guard.soldier!.state = 'search';
    face(guard, gx, gz - 10);
    const back = [...at(gx, gz - 6), ...run([], 20)];
    expect(alarms(back).length).toBeGreaterThanOrEqual(1);
  });

  it('a squad leader who sees you sounds the horn, and the whole squad comes at you', () => {
    const { world, run, zeus, squad, at, parkHades } = underworld();
    parkHades();
    const members = squad('squad-approach');
    const leader = members.find((e) => e.soldier!.leader)!;
    expect(leader.soldier!.kind).toBe('sentry');
    // Stand the squad still, leader looking at a spot 12 m ahead where Zeus appears.
    for (const m of members) m.soldier!.patrol = [{ ...leader.position }];
    const lx = leader.position.x - GROTTO.center.x;
    const lz = leader.position.z - GROTTO.center.z;
    face(leader, lx, lz - 10);
    at(lx, lz - 12);
    const events = run([], 90);
    expect(events).toContainEqual(expect.objectContaining({ type: 'soldier:alarm', entityId: leader.id, kind: 'sentry' }));
    expect(leader.soldier!.awareness).toBeGreaterThanOrEqual(ALERT_AT);
    expect(members.every((m) => m.soldier!.state === 'attack')).toBe(true);
    const before = zeus().health!.current;
    run([], 150);
    expect(zeus().health!.current).toBeLessThan(before);
    void world;
  });

  it('soldiers chase a Shadow Step decoy first', () => {
    const { world, run, soldiers, at, parkHades } = underworld();
    parkHades();
    const guard = soldiers(FORT_SPOTS[1].id)[0];
    guard.soldier!.patrol = [];
    const gx = guard.position.x - GROTTO.center.x;
    const gz = guard.position.z - GROTTO.center.z;
    face(guard, gx, gz - 10);
    // A decoy right in front, Zeus off to the side behind cover of distance.
    at(gx + 30, gz + 30);
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'shadow-decoy', { position: { x: GROTTO.center.x + gx, y: GROTTO.center.y, z: GROTTO.center.z + gz - 5 } });
    const decoy = world.entities[id];
    decoy.decoy = { ownerId: 'x', ticksLeft: 60 };
    decoy.region = 'underworld';
    decoy.position.y = guard.position.y;
    run([], 20);
    expect(guard.soldier!.targetId).toBe(decoy.id);
  });

  it('shield-bearers block from the front; clearing a fort lets you open its chest', () => {
    const { world, run, zeus, soldiers, at, parkHades } = underworld();
    parkHades();
    const fort = FORT_SPOTS[1];
    const shield = soldiers(fort.id).find((s) => s.soldier!.kind === 'shield')!;
    shield.soldier!.patrol = [];
    const sx = shield.position.x - GROTTO.center.x;
    const sz = shield.position.z - GROTTO.center.z;
    face(shield, sx, sz - 5);
    at(sx, sz - 1.6, 0);
    const hit = run([{ type: 'player:action', playerId: 'p1', action: 'punch' }], 8);
    expect(hit).toContainEqual(expect.objectContaining({ type: 'combat:blocked', targetId: shield.id }));

    // The chest is guarded until every soldier in the fort is down.
    const chest = Object.values(world.entities).find((e) => e.structure?.kind === 'chest' && e.fortId === fort.id)!;
    const cx = chest.position.x - GROTTO.center.x;
    const cz = chest.position.z - GROTTO.center.z;
    at(cx, cz + 1.2, Math.PI);
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'guarded' }));
    for (const s of soldiers(fort.id)) s.health!.current = 0;
    expect(run([], 2)).toContainEqual(expect.objectContaining({ type: 'fort:cleared', fortId: fort.id }));
    const inventory = world.players.p1.inventory.length;
    expect(run([{ type: 'player:action', playerId: 'p1', action: 'interact' }])).toContainEqual(expect.objectContaining({ type: 'chest:opened', fortId: fort.id, weaponId: 'sunlit-sword' }));
    expect(world.players.p1.inventory.length).toBe(inventory + 1);
    expect(world.forts[fort.id]).toMatchObject({ cleared: true, chestOpened: true, seen: true });
    void zeus;
  });
});

describe('the Underworld map (M6)', () => {
  it('starts dark, reveals around the gods as they explore, and marks forts once seen; it saves', async () => {
    const { REVEAL_COLS, REVEAL_ROWS, isRevealed, revealGrid } = await import('./systems/reveal');
    const { world, run, at } = underworld();
    run([], 15);
    const grid = revealGrid(world);
    expect(grid).toHaveLength(REVEAL_COLS * REVEAL_ROWS);
    expect(isRevealed(grid, 0, 0)).toBe(true);
    expect(isRevealed(grid, 0, -300)).toBe(false);
    const fort = FORT_SPOTS[0];
    expect(world.forts[fort.id].seen).toBeFalsy();
    at(fort.x + 20, fort.z);
    expect(run([], 16)).toContainEqual(expect.objectContaining({ type: 'fort:spotted', fortId: fort.id }));
    expect(isRevealed(revealGrid(deserialize(serialize(world))), fort.x, fort.z)).toBe(true);
  });
});

describe('sentry squads and captains (team request, Nov 15)', () => {
  it('every squad route stays on walkable, gentle ground inside the fields', () => {
    for (const q of SENTRY_SQUADS) {
      const pts = [...q.route, q.route[0]];
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5);
        let prev = underworldLocalHeight(a.x, a.z);
        for (let k = 1; k <= steps; k += 1) {
          const x = a.x + ((b.x - a.x) * k) / steps;
          const z = a.z + ((b.z - a.z) * k) / steps;
          expect(underworldInside(x, z, 2), `${q.id} leaves the fields at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBe(true);
          for (const sp of SPIRES) expect(Math.hypot(x - sp.x, z - sp.z), `${q.id} runs into a spire at (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeGreaterThan(sp.radius + 1.5);
          const h = underworldLocalHeight(x, z);
          const slope = Math.atan(Math.abs(h - prev) / (Math.hypot(b.x - a.x, b.z - a.z) / steps));
          expect(slope, `${q.id} too steep near (${x.toFixed(0)}, ${z.toFixed(0)})`).toBeLessThan((32 * Math.PI) / 180);
          prev = h;
        }
      }
    }
  });

  it('a squad walks its route together, followers in formation behind the leader', () => {
    const { run, squad, parkHades, at } = underworld();
    parkHades();
    at(0, 0); // Zeus stays in the grotto, far from every squad
    const members = squad('squad-river');
    const leader = members.find((e) => e.soldier!.leader)!;
    expect(leader.soldier!.kind).toBe('captain');
    const start = { ...leader.position };
    for (let i = 0; i < 10; i += 1) {
      run([], 30);
      for (const m of members) {
        expect(Math.hypot(m.position.x - leader.position.x, m.position.z - leader.position.z)).toBeLessThan(7);
      }
    }
    expect(Math.hypot(leader.position.x - start.x, leader.position.z - start.z)).toBeGreaterThan(5);
  });

  it('after a long patrol every squad is still together (no follower left stuck behind)', () => {
    const { run, squad, parkHades, at } = underworld();
    parkHades();
    at(0, 0);
    run([], 30 * 90);
    for (const q of SENTRY_SQUADS) {
      const members = squad(q.id);
      const leader = members.find((e) => e.soldier!.leader)!;
      for (const m of members) {
        expect(Math.hypot(m.position.x - leader.position.x, m.position.z - leader.position.z), `${q.id}: ${m.id} straggling`).toBeLessThan(8);
      }
    }
  });

  it('only the leader watches: a follower facing you at 10 m does not notice', () => {
    const { run, squad, at, parkHades } = underworld();
    parkHades();
    const members = squad('squad-gates');
    for (const m of members) m.soldier!.patrol = [{ ...m.position }];
    const follower = members.find((e) => !e.soldier!.leader)!;
    const leader = members.find((e) => e.soldier!.leader)!;
    const fx = follower.position.x - GROTTO.center.x;
    const fz = follower.position.z - GROTTO.center.z;
    // The leader looks the other way; the follower looks straight at Zeus.
    face(leader, leader.position.x - GROTTO.center.x, leader.position.z - GROTTO.center.z + 20);
    face(follower, fx + 10, fz);
    at(fx + 10, fz);
    run([], 60);
    expect(follower.soldier!.awareness).toBe(0);
    expect(leader.soldier!.awareness).toBe(0);
  });

  it("captains' armour halves punches and light strikes", () => {
    const { world, run, squad, at, parkHades } = underworld();
    parkHades();
    const members = squad('squad-midfield');
    const captain = members.find((e) => e.soldier!.kind === 'captain')!;
    for (const m of members) {
      m.soldier!.patrol = [{ ...m.position }];
      m.creature!.stun = 1000;
    }
    const cx = captain.position.x - GROTTO.center.x;
    const cz = captain.position.z - GROTTO.center.z;
    at(cx, cz - 1.8, 0);
    const events = run([{ type: 'player:action', playerId: 'p1', action: 'punch' }], 8);
    const hit = events.find((e) => e.type === 'combat:hit' && e.targetId === captain.id) as { amount: number } | undefined;
    expect(events).toContainEqual(expect.objectContaining({ type: 'combat:blocked', targetId: captain.id }));
    expect(hit!.amount).toBeLessThanOrEqual(3); // a 6-damage jab, halved
    expect(captain.health!.max).toBe(180);
    void world;
  });

  it('when the captain falls, his squad breaks and runs, then regroups', () => {
    const { world, run, squad, at, parkHades } = underworld();
    parkHades();
    const members = squad('squad-gates');
    const captain = members.find((e) => e.soldier!.kind === 'captain')!;
    const cx = captain.position.x - GROTTO.center.x;
    const cz = captain.position.z - GROTTO.center.z;
    at(cx, cz - 8);
    captain.health!.current = 0;
    const events = run([], 1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'soldier:rout', squadId: 'squad-gates' }));
    const left = squad('squad-gates');
    expect(left).toHaveLength(3);
    expect(left.every((m) => m.soldier!.state === 'flee')).toBe(true);
    // A new leader takes over, and after the rout they stop running.
    expect(left.filter((m) => m.soldier!.leader)).toHaveLength(1);
    run([], 200);
    expect(left.every((m) => m.soldier!.state !== 'flee')).toBe(true);
    void world;
  });

  it('older saves with lone sentries get the squads instead', () => {
    const { world } = underworld();
    // Recreate the old layout: no squads, one lone sentry.
    for (const e of Object.values(world.entities)) if (e.soldier?.squadId) delete world.entities[e.id];
    world.flags.squadsPlaced = false;
    const { ctx } = createSimContext(world, true);
    const lone = spawn(ctx, 'sentry', { position: { x: GROTTO.center.x, y: GROTTO.center.y, z: GROTTO.center.z - 120 } });
    world.entities[lone].soldier = { kind: 'sentry', fortId: null, state: 'patrol', awareness: 0, targetId: null, lastSeen: null, timer: 0, patrol: [], patrolIndex: 0, facing: 0, windup: 0, cooldown: 0, scan: 0 };
    ensureGarrison(ctx);
    expect(world.entities[lone]).toBeUndefined();
    expect(Object.values(world.entities).filter((e) => e.soldier?.squadId)).toHaveLength(21);
  });
});
