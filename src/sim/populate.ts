import { godDef } from './defs';
import type { GameEvent } from './events';
import { worldRng } from './rng';
import { newHeroState } from './systems/hero';
import { randomMeadowSpot, SHEEP_HOME, SHEEP_TARGET_COUNT, spawnCreature } from './systems/wildlife';
import { HERO_ROCK_TOP } from './terrain/meadow';
import type { EntityId, PlayerId, WorldState, Element } from './types';
import { groundHeightAt } from './terrain/meadow-rocks';
import { createSimContext, spawn, type SimContext } from './world';

/** Zeus starts on the hero rock looking toward Olympus, as in the style test. */
export const HERO_SPAWN = { x: 0, y: HERO_ROCK_TOP, z: 0, rotationY: Math.PI + 0.22 } as const;

/** Practice dummies stand behind the rock (south), out of the opening vista. */
export const DUMMY_SPOTS: ReadonlyArray<{ x: number; z: number; element: Element }> = [
  // Each dummy has an element, so the counter wheel shows (Zeus's lightning beats the Light dummy).
  { x: -3, z: 9, element: 'shadow' },
  { x: 1.5, z: 11, element: 'poison' },
  { x: 5.5, z: 8.5, element: 'light' },
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
  if (!isAuthority) return [];
  if (world.flags.meadowPopulated) return ensureArmory(world, isAuthority);
  const { ctx, events } = createSimContext(world, isAuthority);
  for (const player of Object.values(world.players)) {
    if (!player.entityId || !world.entities[player.entityId]) spawnHero(ctx, player.id);
  }
  DUMMY_SPOTS.forEach((spot) => spawnCreature(ctx, 'practice-dummy', spot.x, spot.z, Math.PI * 0.9, spot.element));
  for (let i = 0; i < SHEEP_TARGET_COUNT; i += 1) {
    const spot = randomMeadowSpot(ctx, SHEEP_HOME, 10);
    spawnCreature(ctx, 'sheep', spot.x, spot.z, worldRng(world, 'wildlife').range(0, Math.PI * 2));
  }
  world.flags.meadowPopulated = true;
  events.push(...ensureArmory(world, isAuthority));
  return events;
}

/** The Fusion Altar stands east of the hero rock, out of the opening vista. */
export const ALTAR_SPOT = { x: 8, z: 3 } as const;

/**
 * Weapons lying in the meadow to find (SPEC §8, M4). Each makes a named
 * legendary with Zeus's starter spear at the altar.
 */
export const MEADOW_WEAPONS: ReadonlyArray<{ weaponId: string; x: number; z: number }> = [
  { weaponId: 'sunlit-sword', x: 12, z: 7 },
  { weaponId: 'storm-axe', x: -9, z: 14 },
  { weaponId: 'oak-staff', x: 9, z: 22 },
];

export function spawnPickup(ctx: SimContext, weaponId: string, x: number, z: number): EntityId {
  const id = spawn(ctx, 'weapon-pickup', { position: { x, y: groundHeightAt(x, z), z } });
  ctx.world.entities[id].pickup = { weaponId };
  return id;
}

export function spawnAltar(ctx: SimContext, x: number, z: number): EntityId {
  const id = spawn(ctx, 'fusion-altar', { position: { x, y: groundHeightAt(x, z), z }, rotationY: -Math.PI / 2 });
  const entity = ctx.world.entities[id];
  entity.structure = { kind: 'fusion-altar' };
  entity.body = { radius: 0.85, height: 1.2 };
  return id;
}

/**
 * M4 additions to the meadow, also applied to older saves: the Fusion Altar,
 * three weapons to find, elements on the practice dummies, and the starter
 * spear in each player's inventory.
 */
export function ensureArmory(world: WorldState, isAuthority = true): GameEvent[] {
  if (world.flags.armoryPlaced || !isAuthority) return [];
  const { ctx, events } = createSimContext(world, isAuthority);
  spawnAltar(ctx, ALTAR_SPOT.x, ALTAR_SPOT.z);
  for (const w of MEADOW_WEAPONS) spawnPickup(ctx, w.weaponId, w.x, w.z);
  for (const dummy of Object.values(world.entities).filter((e) => e.defId === 'practice-dummy' && e.element === undefined)) {
    const spot = DUMMY_SPOTS.reduce((best, s) => (Math.hypot(s.x - dummy.position.x, s.z - dummy.position.z) < Math.hypot(best.x - dummy.position.x, best.z - dummy.position.z) ? s : best));
    dummy.element = spot.element;
  }
  for (const player of Object.values(world.players)) {
    const hero = player.entityId ? world.entities[player.entityId] : undefined;
    if (hero?.hero && player.inventory.length === 0) player.inventory.push(hero.hero.weaponId);
  }
  world.flags.armoryPlaced = true;
  return events;
}

/** The Refuge (SPEC §3.3): after the rocket, a Forge and a bed join the Fusion Altar. */
export const FORGE_SPOT = { x: 11, z: -1 } as const;
export const BED_SPOT = { x: 4.5, z: 6.5 } as const;

function spawnStructure(ctx: SimContext, kind: 'forge' | 'bed', x: number, z: number, rotationY: number, body: { radius: number; height: number }): EntityId {
  const id = spawn(ctx, kind, { position: { x, y: groundHeightAt(x, z), z }, rotationY });
  const entity = ctx.world.entities[id];
  entity.structure = { kind };
  entity.body = body;
  return id;
}

/** Turns the meadow into the Refuge once (also for saves made after the rocket). */
export function ensureRefuge(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.refugeBuilt || !world.flags.prologueDone) return;
  spawnStructure(ctx, 'forge', FORGE_SPOT.x, FORGE_SPOT.z, -Math.PI / 2, { radius: 0.9, height: 1.6 });
  spawnStructure(ctx, 'bed', BED_SPOT.x, BED_SPOT.z, 0.4, { radius: 0.7, height: 0.7 });
  world.flags.refugeBuilt = true;
}
