import { describe, expect, it } from 'vitest';
import type { Intent } from './intents';
import { ensureMeadowPopulated } from './populate';
import { GROTTO } from './regions';
import { deserialize, serialize } from './serialize';
import { ALERT_AT, SENTRY_POSTS } from './systems/soldiers';
import { FORT_SPOTS } from './terrain/underworld';
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
  const soldiers = (fortId?: string) => Object.values(world.entities).filter((e) => e.soldier && e.soldier.kind !== 'sentry' && (!fortId || e.soldier.fortId === fortId));
  const at = (x: number, z: number, rotationY = 0) => run([{ type: 'dev:teleport', playerId: 'p1', x: GROTTO.center.x + x, z: GROTTO.center.z + z, rotationY }], 1);
  /** Parks Hades (the companion) far away and asleep so he stays out of the test. */
  const parkHades = () => {
    world.players.p1.party = [world.players.p1.entityId!];
    hades().region = 'surface';
  };
  return { world, run, zeus, soldiers, at, parkHades };
}

/** Puts a soldier facing a point (in grotto-local coordinates). */
function face(e: Entity, x: number, z: number) {
  e.soldier!.facing = Math.atan2(GROTTO.center.x + x - e.position.x, GROTTO.center.z + z - e.position.z);
  e.rotationY = e.soldier!.facing;
}

describe('forts and sentries (M6)', () => {
  it('places three forts (3, 4 and 5 soldiers, each with a chest) and four sentries, and they survive a save', () => {
    const { world, soldiers } = underworld();
    expect(FORT_SPOTS.map((f) => soldiers(f.id).length)).toEqual([3, 4, 5]);
    expect(Object.values(world.entities).filter((e) => e.soldier?.kind === 'sentry')).toHaveLength(SENTRY_POSTS.length);
    expect(Object.values(world.entities).filter((e) => e.structure?.kind === 'chest')).toHaveLength(3);
    expect(Object.keys(world.forts)).toHaveLength(3);
    const restored = deserialize(serialize(world));
    expect(Object.values(restored.entities).filter((e) => e.soldier)).toHaveLength(16);
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

  it('a sentry who sees you sounds the horn and soldiers nearby come running', () => {
    const { world, run, at, parkHades } = underworld();
    parkHades();
    const sentry = Object.values(world.entities).find((e) => e.soldier?.kind === 'sentry')!;
    const sx = sentry.position.x - GROTTO.center.x;
    const sz = sentry.position.z - GROTTO.center.z;
    sentry.soldier!.postFacing = Math.PI;
    face(sentry, sx, sz - 10);
    at(sx, sz - 12);
    const events = run([], 90);
    const horn = events.find((e) => e.type === 'soldier:alarm' && e.entityId === sentry.id);
    expect(horn).toBeTruthy();
    expect(sentry.soldier!.awareness).toBeGreaterThanOrEqual(ALERT_AT);
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
