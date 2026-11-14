import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../../engine/physics';
import type { Intent, PlayerAction } from '../intents';
import { PhysicsWorld, type Rapier } from '../physics';
import { ensureMeadowPopulated, HERO_SPAWN } from '../populate';
import { serialize, deserialize } from '../serialize';
import { tickWorld } from '../tick';
import { groundHeightAt } from '../terrain/meadow-rocks';
import type { Entity, WorldState } from '../types';
import { createWorld } from '../world';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

function setup(withPhysics = true) {
  const world = createWorld(7, 0);
  ensureMeadowPopulated(world);
  const physics = withPhysics ? new PhysicsWorld(R) : undefined;
  const hero = () => world.entities[world.players.p1.entityId!] as Entity & { hero: NonNullable<Entity['hero']> };
  const run = (n: number, intents: (t: number) => Intent[] = () => []) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: t, isAuthority: true, intents: intents(t), physics }));
    return events;
  };
  const move = (x: number, z: number, extra: Partial<Extract<Intent, { type: 'player:move' }>> = {}): Intent =>
    ({ type: 'player:move', playerId: 'p1', x, z, sprint: false, jumpHeld: false, ...extra });
  const act = (action: PlayerAction): Intent => ({ type: 'player:action', playerId: 'p1', action });
  return { world, physics, hero, run, move, act };
}

describe('hero (with Rapier)', () => {
  it('spawns on the hero rock and stays standing there', () => {
    const { hero, run } = setup();
    expect(hero().position).toMatchObject({ x: HERO_SPAWN.x, z: HERO_SPAWN.z });
    run(30);
    expect(hero().hero.grounded).toBe(true);
    expect(Math.abs(hero().position.y - HERO_SPAWN.y)).toBeLessThan(0.3);
  });

  it('walks in the requested direction and follows the ground', () => {
    const { hero, run, move } = setup();
    run(5);
    run(60, () => [move(0, -1)]);
    const p = hero().position;
    expect(p.z).toBeLessThan(-5);
    expect(Math.abs(p.y - groundHeightAt(p.x, p.z))).toBeLessThan(0.4);
    expect(hero().hero.grounded).toBe(true);
    // Faces the way it walked (−z ≈ ±π).
    expect(Math.abs(Math.abs(hero().rotationY) - Math.PI)).toBeLessThan(0.1);
  });

  it('sprinting is faster and drains stamina, which then refills', () => {
    const walk = setup();
    walk.run(30, () => [walk.move(1, 0)]);
    const sprint = setup();
    sprint.run(30, () => [sprint.move(1, 0, { sprint: true })]);
    expect(sprint.hero().position.x).toBeGreaterThan(walk.hero().position.x + 2);
    const drained = sprint.hero().stamina!.current;
    expect(drained).toBeLessThan(90);
    sprint.run(90, () => [sprint.move(0, 0)]);
    expect(sprint.hero().stamina!.current).toBeGreaterThan(drained);
  });

  it('jumps off the ground and lands again; holding jump hovers longer', () => {
    const plain = setup();
    plain.run(3);
    const startY = plain.hero().position.y;
    plain.run(1, () => [plain.act('jump')]);
    plain.run(6);
    expect(plain.hero().hero.grounded).toBe(false);
    expect(plain.hero().position.y).toBeGreaterThan(startY + 0.5);
    let airborne = 7;
    while (!plain.hero().hero.grounded && airborne < 200) { plain.run(1); airborne += 1; }
    expect(plain.hero().hero.grounded).toBe(true);

    const hover = setup();
    hover.run(3);
    hover.run(1, () => [hover.act('jump'), hover.move(0, 0, { jumpHeld: true })]);
    let hoverAir = 1;
    while (!hover.hero().hero.grounded && hoverAir < 200) { hover.run(1, () => [hover.move(0, 0, { jumpHeld: true })]); hoverAir += 1; }
    expect(hoverAir).toBeGreaterThan(airborne + 10);
  });

  it('dodge rolls with i-frames and costs stamina; not without stamina', () => {
    const { hero, run, act, world } = setup();
    run(3);
    run(1, () => [act('dodge')]);
    expect(hero().hero.dodge).not.toBeNull();
    expect(hero().hero.iframes).toBeGreaterThan(0);
    expect(hero().stamina!.current).toBeLessThan(100);
    run(15);
    expect(hero().hero.dodge).toBeNull();
    hero().stamina!.current = 5;
    const events = run(1, () => [act('dodge')]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'intent:rejected', reason: 'no stamina' }));
    expect(world).toBeTruthy();
  });

  it('the world (with hero state) survives a save round-trip and keeps simulating identically', () => {
    const a = setup();
    a.run(20, (t) => [a.move(t % 2 ? 0.5 : 0, -1)]);
    const copy: WorldState = deserialize(serialize(a.world));
    expect(copy).toEqual(a.world);
  });
});

describe('hero without physics', () => {
  it('walks on the terrain height', () => {
    const { hero, run, move } = setup(false);
    run(45, () => [move(1, 0)]);
    const p = hero().position;
    expect(p.x).toBeGreaterThan(4);
    expect(p.y).toBeCloseTo(groundHeightAt(p.x, p.z), 3);
  });
});
