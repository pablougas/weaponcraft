import { DT, MEADOW_RADIUS, ticks } from '../constants';
import type { PhysicsWorld } from '../physics';
import { enemyDef } from '../defs';
import { worldRng } from '../rng';
import { WATER_LEVEL } from '../terrain/meadow';
import { groundHeightAt, HERO_ROCK, MEADOW_ROCKS, rockColliderRadius } from '../terrain/meadow-rocks';
import { MEADOW_TREES, trunkRadius } from '../terrain/meadow-trees';
import type { Entity, Vec3, Element } from '../types';
import { despawn, spawn, type SimContext } from '../world';

/** Dummies refill this long after the last hit. */
const DUMMY_RESET_TICKS = ticks(3);
/** How far wildlife wanders from home. */
const WANDER_RADIUS = 10;
/** Keep this many sheep in the meadow; a new one arrives this often when short. */
export const SHEEP_TARGET_COUNT = 5;
const SHEEP_ARRIVAL_TICKS = ticks(15);
/** Clearance kept from rocks when choosing where to walk or arrive, metres. */
const ROCK_MARGIN = 0.6;
/** A move that covers less than this fraction of what was asked counts as blocked. */
const BLOCKED_FRACTION = 0.4;
/** Blocked this long: give up on the destination and pick another. */
const BLOCKED_TICKS = ticks(0.5);
/** Downward probe each tick so creatures follow the ground and snap to it. */
const GROUND_PROBE = 0.25;
/** Where the flock lives: south of the hero rock, out of the opening vista. */
export const SHEEP_HOME: Vec3 = { x: 3, y: 0, z: 19 };

/** Places a dummy or wild creature on the ground. */
export function spawnCreature(ctx: SimContext, defId: string, x: number, z: number, rotationY = 0, element: Element | null = null): string {
  const def = enemyDef(defId);
  const position = { x, y: groundHeightAt(x, z), z };
  const id = spawn(ctx, defId, { position, rotationY });
  const entity = ctx.world.entities[id];
  entity.body = { ...def.body };
  entity.health = { current: def.maxHealth, max: def.maxHealth };
  entity.creature = { wanders: def.wanders, home: { ...position }, target: null, wait: 0, flee: 0, sinceHit: DUMMY_RESET_TICKS };
  if (element) entity.element = element;
  return id;
}

/** True if (x, z) is on or right next to an obstacle: the hero rock, a boulder or a tree trunk. */
export function nearRock(x: number, z: number, margin = ROCK_MARGIN): boolean {
  const { center, scale } = HERO_ROCK;
  const hx = (x - center.x) / (scale.x + margin);
  const hz = (z - center.z) / (scale.z + margin);
  if (hx * hx + hz * hz <= 1) return true;
  return MEADOW_ROCKS.some((rock) => Math.hypot(x - rock.position.x, z - rock.position.z) <= rockColliderRadius(rock) + margin)
    || MEADOW_TREES.some((tree) => Math.hypot(x - tree.x, z - tree.z) <= trunkRadius(tree) + margin);
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
    if (y > WATER_LEVEL + 1 && !nearRock(x, z)) return { x, y, z };
  }
  return { ...centre, y: groundHeightAt(centre.x, centre.z) };
}

/** Advances dummies and wildlife: resets, wandering, fleeing, removal and arrivals. */
export function updateCreatures(ctx: SimContext, physics?: PhysicsWorld): void {
  const { world } = ctx;
  const heroes = Object.values(world.entities).filter((e) => e.hero);
  let sheepCount = 0;

  for (const entity of Object.values(world.entities)) {
    const creature = entity.creature;
    // (Soldiers and mech parts have their own systems.)
    if (!creature || !entity.health || entity.soldier || entity.mechPart) continue;
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
    moveWildlife(ctx, entity, heroes, physics);
  }

  if (ctx.isAuthority && sheepCount < SHEEP_TARGET_COUNT && world.tick % SHEEP_ARRIVAL_TICKS === 0) {
    const spot = randomMeadowSpot(ctx, SHEEP_HOME, WANDER_RADIUS);
    spawnCreature(ctx, 'sheep', spot.x, spot.z, worldRng(world, 'wildlife').range(0, Math.PI * 2));
  }
}

function moveWildlife(ctx: SimContext, entity: Entity, heroes: Entity[], physics?: PhysicsWorld): void {
  const creature = entity.creature!;
  // Knocked back or stunned (Lightning Fist, Sky Strike): no walking.
  if (creature.knock && creature.knock.ticks > 0) {
    creature.knock.ticks -= 1;
    step(entity, creature.knock.x * DT, creature.knock.z * DT, physics);
    if (creature.knock.ticks <= 0) creature.knock = null;
    if (creature.stun) creature.stun = Math.max(0, creature.stun - 1);
    return;
  }
  if (creature.stun && creature.stun > 0) {
    creature.stun -= 1;
    step(entity, 0, 0, physics);
    return;
  }
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

  if (!dir) {
    step(entity, 0, 0, physics);
    return;
  }
  const dx = dir.x * pace * DT;
  const dz = dir.z * pace * DT;
  const x = entity.position.x + dx;
  const z = entity.position.z + dz;
  // Don't walk into the sea or off the meadow.
  if (groundHeightAt(x, z) < WATER_LEVEL + 1 || Math.hypot(x, z) > MEADOW_RADIUS) {
    creature.target = null;
    creature.flee = 0;
    return;
  }
  entity.rotationY = Math.atan2(dir.x, dir.z);
  const covered = step(entity, dx, dz, physics);
  // Walked into a rock (or another creature): go around by picking a new destination.
  creature.blocked = covered < Math.hypot(dx, dz) * BLOCKED_FRACTION ? (creature.blocked ?? 0) + 1 : 0;
  if (creature.blocked >= BLOCKED_TICKS) {
    creature.blocked = 0;
    creature.flee = 0;
    creature.target = randomMeadowSpot(ctx, entity.position, WANDER_RADIUS * 0.6);
  }
}

/**
 * Moves a creature by (dx, dz) through Rapier, so rocks, the hero rock and
 * other bodies block it (M3.1: sheep used to walk through rocks). Without
 * physics (unit tests) it walks on the terrain height. Returns the distance covered.
 */
function step(entity: Entity, dx: number, dz: number, physics?: PhysicsWorld): number {
  const before = entity.position;
  const moved = physics?.moveCharacter(entity.id, { x: dx, y: -GROUND_PROBE, z: dz });
  if (moved) {
    entity.position = moved.position;
  } else {
    const x = before.x + dx;
    const z = before.z + dz;
    entity.position = { x, y: groundHeightAt(x, z), z };
  }
  return Math.hypot(entity.position.x - before.x, entity.position.z - before.z);
}
