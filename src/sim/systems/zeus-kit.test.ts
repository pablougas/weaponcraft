import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../events';
import type { Intent, PlayerAction } from '../intents';
import { ensureMeadowPopulated } from '../populate';
import { tickWorld } from '../tick';
import { groundHeightAt } from '../terrain/meadow-rocks';
import type { Entity } from '../types';
import { createWorld } from '../world';
import { DODGE_TICKS } from './hero';

/** A meadow with the sheep moved away and Zeus in front of a practice dummy. */
function arena() {
  const world = createWorld(3, 0);
  ensureMeadowPopulated(world);
  const hero = world.entities[world.players.p1.entityId!] as Entity & { hero: NonNullable<Entity['hero']> };
  const dummies = Object.values(world.entities).filter((e) => e.defId === 'practice-dummy');
  for (const e of Object.values(world.entities)) if (e.defId === 'sheep') e.position = { x: 60, y: groundHeightAt(60, 60), z: 60 };
  let held: Partial<Extract<Intent, { type: 'player:move' }>> = {};
  const move = (extra: Partial<Extract<Intent, { type: 'player:move' }>>): Intent => {
    held = { ...held, ...extra };
    return { type: 'player:move', playerId: 'p1', x: 0, z: 0, sprint: false, jumpHeld: false, ...held };
  };
  const act = (action: PlayerAction): Intent => ({ type: 'player:action', playerId: 'p1', action });
  /** Runs `n` ticks; `intents` go in on the first one. */
  const run = (n: number, intents: Intent[] = []): GameEvent[] => {
    const events: GameEvent[] = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: t, isAuthority: true, intents: t === 0 ? intents : [] }));
    return events;
  };
  const faceDummy = (dummy: Entity, distance: number) => {
    const x = dummy.position.x;
    const z = dummy.position.z - distance;
    hero.position = { x, y: groundHeightAt(x, z), z };
    hero.rotationY = 0;
    hero.hero.aimYaw = 0;
    hero.hero.grounded = true;
  };
  const hits = (events: GameEvent[], targetId?: string) =>
    events.filter((e): e is Extract<GameEvent, { type: 'combat:hit' }> => e.type === 'combat:hit' && (!targetId || e.targetId === targetId));
  return { world, hero, dummies, move, act, run, faceDummy, hits };
}

describe('Chain Lightning hold-to-fire (Q)', () => {
  it('keeps firing every 0.3 s while held, until stamina runs out', () => {
    const { hero, dummies, move, run, faceDummy } = arena();
    faceDummy(dummies[0], 4);
    const events = run(150, [move({ abilityHeld: true })]);
    const casts = events.filter((e) => e.type === 'ability:cast');
    // 100 stamina / 8 per bolt = 12 bolts, then it stops.
    expect(casts.length).toBe(12);
    expect(hero.stamina!.current).toBeLessThan(8);
    expect(events).toContainEqual(expect.objectContaining({ type: 'hero:exhausted' }));
    // Bolts come at the fire rate, not all at once.
    const ticks = casts.map((c) => c.tick);
    expect(ticks[1] - ticks[0]).toBe(9);
  });

  it('stops firing when Q is released', () => {
    const { move, run, dummies, faceDummy } = arena();
    faceDummy(dummies[0], 4);
    const held = run(20, [move({ abilityHeld: true })]).filter((e) => e.type === 'ability:cast').length;
    const after = run(60, [move({ abilityHeld: false })]).filter((e) => e.type === 'ability:cast').length;
    expect(held).toBeGreaterThanOrEqual(2);
    expect(after).toBe(0);
  });
});

describe('Sky Strike (R)', () => {
  it('drains all stamina, marks the spot, then lands a big area hit with damage from the stamina spent', () => {
    const { hero, dummies, act, run, faceDummy, hits } = arena();
    faceDummy(dummies[0], 4);
    hero.stamina!.current = 80;
    run(1, [act('lockOn')]);
    const events = run(30, [act('ultimate')]);
    expect(hero.stamina!.current).toBeLessThan(5); // spent, barely starting to refill
    const telegraph = events.find((e) => e.type === 'ability:telegraph');
    const strike = events.find((e) => e.type === 'ability:strike');
    expect(telegraph).toBeDefined();
    expect(strike).toBeDefined();
    expect(strike!.tick - telegraph!.tick).toBe(18); // 0.6 s marker
    const dummyHits = hits(events, hero.hero.lockTarget ?? dummies[0].id);
    expect(dummyHits.length).toBe(1);
    expect(dummyHits[0].amount).toBeGreaterThanOrEqual(Math.round(80 * 1.2 * 0.6));
    expect(hero.hero.cooldowns['sky-strike']).toBeGreaterThan(300);
  });

  it('needs at least half stamina', () => {
    const { hero, act, run } = arena();
    hero.stamina!.current = 40;
    const events = run(1, [act('ultimate')]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'no stamina' }));
    expect(hero.stamina!.current).toBeGreaterThanOrEqual(40); // untouched (and refilling)
  });
});

describe('punch combo (A)', () => {
  it('jab, cross, uppercut when pressed in rhythm, each hitting the dummy', () => {
    const { hero, dummies, act, run, faceDummy, hits } = arena();
    faceDummy(dummies[0], 1.4);
    const all: GameEvent[] = [];
    const steps: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      all.push(...run(1, [act('punch')]));
      steps.push(hero.hero.attack?.step ?? 0);
      all.push(...run(16));
    }
    expect(steps).toEqual([1, 2, 3]);
    expect(hits(all, dummies[0].id).map((h) => h.amount)).toEqual([6, 7, 11]);
  });
});

describe('Lightning Fist (D)', () => {
  const throwFist = (holdTicks: number) => {
    const a = arena();
    a.faceDummy(a.dummies[0], 3);
    const events = [...a.run(holdTicks, [a.move({ chargeHeld: true })]), ...a.run(20, [a.move({ chargeHeld: false })])];
    return { ...a, events };
  };

  it('a longer charge lunges further and hits harder', () => {
    const quick = throwFist(2);
    const full = throwFist(30);
    // The first hit is the punch itself; any second one is the lightning arc to a neighbour.
    const quickHit = quick.hits(quick.events)[0];
    const fullHit = full.hits(full.events)[0];
    expect(quickHit).toBeDefined();
    expect(fullHit).toBeDefined();
    expect(fullHit.amount).toBeGreaterThan(quickHit.amount + 15);
    expect(fullHit.amount).toBeGreaterThanOrEqual(44);
    expect(full.hero.hero.cooldowns['lightning-fist']).toBeGreaterThan(0);
    // The fist also arcs lightning (drawn from the target).
    expect(full.events).toContainEqual(expect.objectContaining({ type: 'ability:cast', abilityId: 'lightning-fist' }));
  });
});

describe('weapon strike (S)', () => {
  it('a tap is a light strike, a hold is a heavy one', () => {
    const tap = arena();
    tap.faceDummy(tap.dummies[0], 1.8);
    const tapEvents = [...tap.run(2, [tap.move({ weaponHeld: true })]), ...tap.run(30, [tap.move({ weaponHeld: false })])];
    expect(tapEvents).toContainEqual(expect.objectContaining({ type: 'hero:attack', kind: 'light' }));

    const hold = arena();
    hold.faceDummy(hold.dummies[0], 1.8);
    const holdEvents = [...hold.run(12, [hold.move({ weaponHeld: true })]), ...hold.run(30, [hold.move({ weaponHeld: false })])];
    expect(holdEvents).toContainEqual(expect.objectContaining({ type: 'hero:attack', kind: 'heavy' }));
    expect(holdEvents).not.toContainEqual(expect.objectContaining({ type: 'hero:attack', kind: 'light' }));
  });
});

describe('dodge roll (X)', () => {
  it('is fast: about 4.5 m in about a quarter second', () => {
    const { hero, move, act, run } = arena();
    hero.position = { x: 10, y: groundHeightAt(10, 20), z: 20 };
    run(3, [move({ x: 1, z: 0 })]);
    const start = { ...hero.position };
    run(1, [act('dodge')]);
    run(DODGE_TICKS);
    expect(Math.hypot(hero.position.x - start.x, hero.position.z - start.z)).toBeGreaterThan(4);
    expect(DODGE_TICKS / 30).toBeLessThan(0.3);
  });

  it('a roll pressed during an attack wind-up comes out right after the hit (input buffer)', () => {
    const { hero, dummies, act, run, faceDummy } = arena();
    faceDummy(dummies[0], 1.4);
    run(1, [act('punch')]);
    const events = run(1, [act('dodge')]);
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'intent:rejected' }));
    const later = run(6);
    expect(later).toContainEqual(expect.objectContaining({ type: 'hero:dodge' }));
    expect(hero.hero.dodge).not.toBeNull();
  });
});
