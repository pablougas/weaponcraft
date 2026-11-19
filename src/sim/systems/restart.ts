import { ticks } from '../constants';
import { GROTTO, groundAt, oceanPoint, regionOf } from '../regions';
import { OCEAN_ARRIVAL } from '../terrain/ocean';
import { MECH_PATROL } from '../terrain/underworld';
import type { Entity, HeroState } from '../types';
import { despawn, type SimContext } from '../world';
import { findMech, MECH, spawnPlating } from './mech';
import { bedSide, REST_HEAL_TICK, respawnBed, startRest, stopEverything } from './rest';
import { restartGarrison } from './soldiers';
import { restartKrakenMech } from './kraken-mech';
import { restartVillage } from './village';
import { findWarden } from './warden';

/** "Reset level": the screen fades this long before the god wakes at the bed. */
export const RESET_FADE = ticks(1);

/**
 * Starts every enemy over (team request, Nov 15): when the god you control
 * falls, or on "Reset level". All soldiers back at their posts and calm (cleared
 * forts refilled), the Mk. II standing on watch with its plating whole even if
 * it was beaten, and the Warden back inside it. Story scenes already seen stay
 * seen (Cerberus's howl, Poseidon); the barricade stays down.
 */
export function restartEncounters(ctx: SimContext): void {
  const { world } = ctx;
  for (const e of Object.values(world.entities)) if (e.decoy) despawn(ctx, e.id);
  restartGarrison(ctx);
  restartVillage(ctx);
  restartKrakenMech(ctx);

  // The Mk. II stands up again on watch with fresh plating, even if it was beaten (team request).
  const mech = findMech(world);
  if (mech) {
    const start = MECH_PATROL[0];
    const next = MECH_PATROL[1];
    const x = GROTTO.center.x + start.x;
    const z = GROTTO.center.z + start.z;
    mech.position = { x, y: groundAt('underworld', x, z), z };
    mech.rotationY = Math.atan2(next.x - start.x, next.z - start.z);
    Object.assign(mech.mech, { mode: 'patrol', awareness: 0, targetId: null, lastSeen: null, timer: 0, patrolIndex: 1, facing: mech.rotationY, scan: 0, attack: null, cooldown: 0, walking: false, lastAttack: null });
    const plating = mech.mech.platingId ? world.entities[mech.mech.platingId] : undefined;
    if (plating?.health) plating.health.current = MECH.plating;
    else spawnPlating(ctx, mech);
  }

  // The Warden goes back inside: he climbs out again when the Mk. II breaks down.
  const warden = findWarden(world);
  if (warden) despawn(ctx, warden.id);
  world.flags.wardenEmerged = false;
  world.flags.wardenDefeated = false;
  if (world.objective === 'defeat-the-warden' || world.objective === 'release-cerberus') {
    world.objective = 'find-and-free-cerberus';
    ctx.emit('objective:set', { objectiveId: 'find-and-free-cerberus' });
  }
}

/**
 * Both gods of the player wake at the bed, healed (the companion stands beside
 * it). In the Ocean (no bed there) they start over at the sea-gate they came
 * through instead of back in the Underworld (team request, Nov 16).
 */
export function wakeAtBed(ctx: SimContext, entity: Entity & { hero: HeroState }): 'refuge' | 'sea-gate' {
  const bed = respawnBed(ctx, entity);
  if (regionOf(entity) === 'ocean' && ctx.world.flags.seaGateOpen && (!bed || regionOf(bed) !== 'ocean')) {
    wakeAtSeaGate(ctx, entity);
    return 'sea-gate';
  }
  if (!bed) return 'refuge';
  startRest(ctx, entity, bed, REST_HEAL_TICK - 1); // already in the dark; heals on the next tick
  const player = Object.values(ctx.world.players).find((p) => p.entityId === entity.id);
  for (const id of player?.party ?? []) {
    const other = ctx.world.entities[id];
    if (!other?.hero || other.id === entity.id) continue;
    other.hero.down = null;
    other.hero.rest = null;
    other.hero.attack = null;
    other.region = bed.region;
    const side = bedSide(bed);
    const x = side.x + Math.sin(bed.rotationY) * 1.6;
    const z = side.z + Math.cos(bed.rotationY) * 1.6;
    other.position = { x, y: groundAt(bed.region ?? 'surface', x, z), z };
    other.rotationY = bed.rotationY;
    if (other.health) other.health.current = other.health.max;
    if (other.stamina) other.stamina.current = other.stamina.max;
    other.statuses = [];
    other.hero.lastSafe = { ...other.position };
  }
  return 'refuge';
}

/** The party stands up by the Ocean's sea-gate, where they arrived, healed, and the screen fades back in. */
function wakeAtSeaGate(ctx: SimContext, entity: Entity & { hero: HeroState }): void {
  const arrival = oceanPoint(OCEAN_ARRIVAL.x, OCEAN_ARRIVAL.z);
  const yaw = OCEAN_ARRIVAL.rotationY;
  const player = Object.values(ctx.world.players).find((p) => p.entityId === entity.id);
  const party = [entity.id, ...(player?.party ?? []).filter((id) => id !== entity.id)];
  party.forEach((id, i) => {
    const god = ctx.world.entities[id];
    if (!god?.hero) return;
    // Same spots as stepping through the gate: the companion beside and a little behind.
    const side = i === 0 ? 0 : 1.6;
    const back = i === 0 ? 0 : 1.4;
    const x = arrival.x + Math.cos(yaw) * side - Math.sin(yaw) * back;
    const z = arrival.z - Math.sin(yaw) * side - Math.cos(yaw) * back;
    stopEverything(god.hero);
    Object.assign(god.hero, { down: null, rest: null, resetting: null, waking: i === 0 ? 0 : null, grounded: true, moving: false });
    god.region = 'ocean';
    god.position = { x, y: groundAt('ocean', x, z), z };
    god.rotationY = yaw;
    if (god.health) god.health.current = god.health.max;
    if (god.stamina) god.stamina.current = god.stamina.max;
    god.statuses = [];
    god.hero.lastSafe = { ...god.position };
  });
}
