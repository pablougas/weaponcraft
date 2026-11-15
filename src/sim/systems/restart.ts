import { ticks } from '../constants';
import { GROTTO, groundAt } from '../regions';
import { MECH_PATROL } from '../terrain/underworld';
import type { Entity, HeroState } from '../types';
import { despawn, type SimContext } from '../world';
import { findMech, MECH, spawnPlating } from './mech';
import { bedSide, REST_HEAL_TICK, respawnBed, startRest } from './rest';
import { restartGarrison } from './soldiers';
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

/** Both gods of the player wake at the bed, healed (the companion stands beside it). */
export function wakeAtBed(ctx: SimContext, entity: Entity & { hero: HeroState }): void {
  const bed = respawnBed(ctx, entity);
  if (!bed) return;
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
}
