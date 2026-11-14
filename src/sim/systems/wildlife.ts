import { DT, MEADOW_RADIUS, ticks } from '../constants';
import { enemyDef } from '../defs';
import { worldRng } from '../rng';
import { WATER_LEVEL } from '../terrain/meadow';
import { groundHeightAt } from '../terrain/meadow-rocks';
import type { Entity, Vec3 } from '../types';
import { despawn, spawn, type SimContext } from '../world';

/** Dummies refill this long after the last hit. */
const DUMMY_RESET_TICKS = ticks(3);
/** How far wildlife wanders from home. */
const WANDER_RADIUS = 10;
/** Keep this many sheep in the meadow; a new one arrives this often when short. */
export const SHEEP_TARGET_COUNT = 5;
const SHEEP_ARRIVAL_TICKS = ticks(15);
/** Where the flock lives: south of the hero rock, out of the opening vista. */
export const SHEEP_HOME: Vec3 = { x: 3, y: 0, z: 19 };

/** Places a dummy or wild creature on the ground. */
export function spawnCreature(ctx: SimContext, defId: string, x: number, z: number, rotationY = 0): string {
  const def = enemyDef(defId);
  const position = { x, y: groundHeightAt(x, z), z };
  const id = spawn(ctx, defId, { position, rotationY });
  const entity = ctx.world.entities[id];
  entity.body = { ...def.body };
  entity.health = { current: def.maxHealth, max: def.maxHealth };
  entity.creature = { wanders: def.wanders, home: { ...position }, target: null, wait: 0, flee: 0, sinceHit: DUMMY_RESET_TICKS };
  return id;
}

/** A random dry spot within `radius` of `centre`, from the world's wildlife RNG stream. */
export function randomMeadowSpot(ctx: SimContext, centre: Vec3, radius: number): Vec3 {
  const random = worldRng(ctx.world, 'wildlife');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const a = random.next() * Math.PI * 2;
    const r = Math.sqrt(random.next()) * radius;
    const x = centre.x + Math.cos(a) * r;
    const z = centre.z + Math.sin(a) * r;
    const y = groundHeightAt(x, z);
    if (y > WATER_LEVEL + 1) return { x, y, z };
  }
  return { ...centre, y: groundHeightAt(centre.x, centre.z) };
}

/** Advances dummies and wildlife: resets, wandering, fleeing, removal and arrivals. */
export function updateCreatures(ctx: SimContext): void {
  const { world } = ctx;
  const heroes = Object.values(world.entities).filter((e) => e.hero);
  let sheepCount = 0;

  for (const entity of Object.values(world.entities)) {
    const creature = entity.creature;
    if (!creature || !entity.health) continue;
    creature.sinceHit += 1;

    if (!creature.wanders) {
      // Practice dummies never die; they refill a few seconds after the last hit.
      if (entity.health.current < entity.health.max && creature.sinceHit >= DUMMY_RESET_TICKS) {
        entity.health.current = entity.health.max;
      }
      continue;
    }

    if (entity.health.current <= 0) {
      if (ctx.isAuthority) despawn(ctx, entity.id);
      continue;
    }
    if (entity.defId === 'sheep') sheepCount += 1;
    moveWildlife(ctx, entity, heroes);
  }

  if (ctx.isAuthority && sheepCount < SHEEP_TARGET_COUNT && world.tick % SHEEP_ARRIVAL_TICKS === 0) {
    const spot = randomMeadowSpot(ctx, SHEEP_HOME, WANDER_RADIUS);
    spawnCreature(ctx, 'sheep', spot.x, spot.z, worldRng(world, 'wildlife').range(0, Math.PI * 2));
  }
}

function moveWildlife(ctx: SimContext, entity: Entity, heroes: Entity[]): void {
  const creature = entity.creature!;
  const speed = enemyDef(entity.defId).speed;
  let dir: { x: number; z: number } | null = null;
  let pace = speed;

  if (creature.flee > 0) {
    creature.flee -= 1;
    const nearest = heroes
      .map((h) => ({ h, d: Math.hypot(h.position.x - entity.position.x, h.position.z - entity.position.z) }))
      .sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d > 0.01) {
      dir = { x: (entity.position.x - nearest.h.position.x) / nearest.d, z: (entity.position.z - nearest.h.position.z) / nearest.d };
      pace = speed * 2.6;
    }
  } else if (creature.target) {
    const dx = creature.target.x - entity.position.x;
    const dz = creature.target.z - entity.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.4) {
      creature.target = null;
      creature.wait = worldRng(ctx.world, 'wildlife').int(ticks(2), ticks(6));
    } else {
      dir = { x: dx / distance, z: dz / distance };
    }
  } else if (creature.wait > 0) {
    creature.wait -= 1;
  } else {
    creature.target = randomMeadowSpot(ctx, creature.home, WANDER_RADIUS);
  }

  if (!dir) return;
  const x = entity.position.x + dir.x * pace * DT;
  const z = entity.position.z + dir.z * pace * DT;
  const y = groundHeightAt(x, z);
  // Don't walk into the sea or off the meadow.
  if (y < WATER_LEVEL + 1 || Math.hypot(x, z) > MEADOW_RADIUS) {
    creature.target = null;
    creature.flee = 0;
    return;
  }
  entity.position = { x, y, z };
  entity.rotationY = Math.atan2(dir.x, dir.z);
}
