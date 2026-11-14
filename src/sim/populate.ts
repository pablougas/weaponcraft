import { godDef } from './defs';
import type { GameEvent } from './events';
import { worldRng } from './rng';
import { newHeroState } from './systems/hero';
import { randomMeadowSpot, SHEEP_HOME, SHEEP_TARGET_COUNT, spawnCreature } from './systems/wildlife';
import { HERO_ROCK_TOP } from './terrain/meadow';
import type { EntityId, PlayerId, WorldState } from './types';
import { createSimContext, spawn, type SimContext } from './world';

/** Zeus starts on the hero rock looking toward Olympus, as in the style test. */
export const HERO_SPAWN = { x: 0, y: HERO_ROCK_TOP, z: 0, rotationY: Math.PI + 0.22 } as const;

/** Practice dummies stand behind the rock (south), out of the opening vista. */
export const DUMMY_SPOTS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -3, z: 9 },
  { x: 1.5, z: 11 },
  { x: 5.5, z: 8.5 },
];

/** Spawns a player's god on the hero rock and links it to the player. */
export function spawnHero(ctx: SimContext, playerId: PlayerId, godId = 'zeus'): EntityId {
  const def = godDef(godId);
  const id = spawn(ctx, godId, {
    position: { x: HERO_SPAWN.x, y: HERO_SPAWN.y, z: HERO_SPAWN.z },
    rotationY: HERO_SPAWN.rotationY,
    ownerId: playerId,
  });
  const entity = ctx.world.entities[id];
  entity.body = { ...def.body };
  entity.health = { current: def.maxHealth, max: def.maxHealth };
  entity.stamina = { current: def.maxStamina, max: def.maxStamina };
  entity.hero = newHeroState(def.starterWeaponId);
  ctx.world.players[playerId].entityId = id;
  return id;
}

/**
 * Fills a new (or pre-M3) world with the meadow's cast: each player's god,
 * three practice dummies and a small flock. Does nothing if already done.
 * Returns the events emitted (entity spawns).
 */
export function ensureMeadowPopulated(world: WorldState, isAuthority = true): GameEvent[] {
  if (world.flags.meadowPopulated || !isAuthority) return [];
  const { ctx, events } = createSimContext(world, isAuthority);
  for (const player of Object.values(world.players)) {
    if (!player.entityId || !world.entities[player.entityId]) spawnHero(ctx, player.id);
  }
  DUMMY_SPOTS.forEach((spot) => spawnCreature(ctx, 'practice-dummy', spot.x, spot.z, Math.PI * 0.9));
  for (let i = 0; i < SHEEP_TARGET_COUNT; i += 1) {
    const spot = randomMeadowSpot(ctx, SHEEP_HOME, 10);
    spawnCreature(ctx, 'sheep', spot.x, spot.z, worldRng(world, 'wildlife').range(0, Math.PI * 2));
  }
  world.flags.meadowPopulated = true;
  return events;
}
