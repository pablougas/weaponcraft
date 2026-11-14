import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../../engine/physics';
import { MEADOW_RADIUS } from '../constants';
import type { Intent } from '../intents';
import { PhysicsWorld, type Rapier } from '../physics';
import { ensureMeadowPopulated } from '../populate';
import { meadowHeightAt } from '../terrain/meadow';
import { groundHeightAt, HERO_ROCK, MEADOW_ROCKS, rockColliderRadius } from '../terrain/meadow-rocks';
import { tickWorld } from '../tick';
import type { Entity } from '../types';
import { createWorld } from '../world';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

function setup(seed = 7) {
  const world = createWorld(seed, 0);
  ensureMeadowPopulated(world);
  const physics = new PhysicsWorld(R);
  const hero = () => world.entities[world.players.p1.entityId!] as Entity & { hero: NonNullable<Entity['hero']> };
  const move = (x: number, z: number): Intent => ({ type: 'player:move', playerId: 'p1', x, z, sprint: true, jumpHeld: false });
  let t = 0;
  const tick = (intents: Intent[] = []) => tickWorld(world, { nowMs: (t += 1), isAuthority: true, intents, physics });
  return { world, physics, hero, move, tick };
}

describe('meadow edge (M3.1: stuck in the hillside)', () => {
  it('walking outward anywhere along the edge never sinks into the terrain, and you can walk back', () => {
    for (let deg = 0; deg < 360; deg += 10) {
      const { hero, move, tick } = setup();
      const a = (deg * Math.PI) / 180;
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      const r0 = MEADOW_RADIUS - 12;
      const x0 = dir.x * r0;
      const z0 = dir.z * r0;
      if (groundHeightAt(x0, z0) < -23) continue; // starting point is in the lake
      hero().position = { x: x0, y: meadowHeightAt(x0, z0) + 0.5, z: z0 };
      tick();
      // Sprint straight outward for 6 s, past the edge.
      tick([move(dir.x, dir.z)]);
      for (let i = 0; i < 180; i += 1) {
        tick();
        const p = hero().position;
        expect(p.y, `sank at ${deg}° tick ${i}`).toBeGreaterThan(meadowHeightAt(p.x, p.z) - 0.35);
        expect(Math.hypot(p.x, p.z), `left the meadow at ${deg}°`).toBeLessThan(MEADOW_RADIUS + 1);
      }
      // Then walk back in: you must actually be able to leave the edge.
      const before = Math.hypot(hero().position.x, hero().position.z);
      tick([move(-dir.x, -dir.z)]);
      for (let i = 0; i < 60; i += 1) tick();
      const after = Math.hypot(hero().position.x, hero().position.z);
      expect(after, `stuck at the edge at ${deg}°`).toBeLessThan(before - 4);
    }
  }, 120_000);

  it('a hero pushed under the ground is lifted back out', () => {
    const { hero, tick } = setup();
    const x = 20;
    const z = 30;
    hero().position = { x, y: meadowHeightAt(x, z) - 3, z };
    tick();
    tick();
    expect(hero().position.y).toBeGreaterThan(meadowHeightAt(x, z) - 0.35);
  });
});

describe('wildlife collision (M3.1: sheep walked through rocks)', () => {
  it('over two minutes of wandering and fleeing, no sheep ever stands inside a rock', () => {
    const { world, hero, move, tick } = setup(11);
    const insideRock = (e: Entity) => {
      const r = e.body?.radius ?? 0.4;
      const { center, scale } = HERO_ROCK;
      const hx = (e.position.x - center.x) / scale.x;
      const hz = (e.position.z - center.z) / scale.z;
      if (hx * hx + hz * hz < 0.55 && e.position.y < HERO_ROCK.top - 0.5) return 'hero rock';
      for (const rock of MEADOW_ROCKS) {
        const d = Math.hypot(e.position.x - rock.position.x, e.position.z - rock.position.z);
        if (d < rockColliderRadius(rock) - r * 0.5 && e.position.y < rock.position.y + rockColliderRadius(rock) * 0.5) return `rock ${rock.index}`;
      }
      return null;
    };
    for (let i = 0; i < 30 * 120; i += 1) {
      // Every 10 s, run at the flock to scatter it (fleeing sheep used to cut through rocks).
      if (i % 300 === 0) {
        const sheep = Object.values(world.entities).find((e) => e.defId === 'sheep');
        if (sheep) {
          hero().position = { x: sheep.position.x - 2, y: groundHeightAt(sheep.position.x - 2, sheep.position.z), z: sheep.position.z };
          if (sheep.creature) sheep.creature.flee = 75;
        }
        tick([move(0, 0)]);
      } else {
        tick();
      }
      for (const e of Object.values(world.entities)) {
        if (e.defId !== 'sheep') continue;
        expect(insideRock(e), `${e.id} inside a rock at tick ${i}`).toBeNull();
      }
    }
  }, 120_000);
});
