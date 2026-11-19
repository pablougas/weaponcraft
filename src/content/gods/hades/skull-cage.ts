import type { UltimateModule } from '../../../sim/abilities';
import { addStatus, applyDamage, flatDistance, isHittable } from '../../../sim/combat';
import { ticks, TICK_HZ } from '../../../sim/constants';
import { groundAt, regionOf, sameRegion } from '../../../sim/regions';
import type { EntityId } from '../../../sim/types';
import { aimPoint, lockedTarget } from '../zeus/aim';

const RADIUS = 4;
/** The slam when the cage shuts, then crushing for as long as it holds (team request, Nov 15: crush them inside). */
const SLAM_DAMAGE = 20;
const SLAM_PER_STAMINA = 0.4;
const DAMAGE_PER_STAMINA = 1.2;
/** How long the cage holds and crushes (team request, Nov 18: last longer; was 4 s). The view's bone cage stands this long too. */
export const CAGE_SECONDS = 8;
const TRAP_TICKS = ticks(CAGE_SECONDS);
const CRUSH_SECONDS = CAGE_SECONDS;
/** Bosses (the Warden, the Tide Engineer) are only held this long (was 2 s). */
const BOSS_TRAP_TICKS = ticks(4);
const AIM_DISTANCE = 10;

/**
 * Hades's R: needs at least half stamina and spends all of it. A red warning
 * ring marks the spot for 1.5 s (the lock-on target, or 10 m ahead), then a
 * cage of bone drops (4 m): it slams down on everything inside (20 + 0.4 ×
 * stamina spent), holds them for 8 s (a boss for 4 s) and crushes them for
 * 1.2 × stamina spent over those 8 s. 8 s cooldown. Same fairness rules as Sky
 * Strike: the marker always comes first and nothing flashes.
 */
export const skullCage: UltimateModule = {
  id: 'skull-cage',
  icon: 'cage',
  name: 'Skull Cage',
  element: 'shadow',
  // Recovers faster (team request, Nov 15; was 12 s).
  cooldownTicks: ticks(8),
  minStaminaFraction: 0.5,
  telegraphTicks: ticks(1.5),
  radius: RADIUS,
  target(ctx, casterId) {
    const caster = ctx.world.entities[casterId];
    if (!caster) return null;
    const lock = lockedTarget(ctx, caster);
    if (lock) return { x: lock.position.x, y: groundAt(regionOf(lock), lock.position.x, lock.position.z), z: lock.position.z };
    return aimPoint(caster, AIM_DISTANCE);
  },
  land(ctx, casterId, point, spent) {
    const caster = ctx.world.entities[casterId];
    const hit: EntityId[] = [];
    const perSecond = (spent * DAMAGE_PER_STAMINA) / CRUSH_SECONDS;
    for (const entity of Object.values(ctx.world.entities)) {
      if (entity.id === casterId || entity.hero || !isHittable(entity) || !sameRegion(entity, caster)) continue;
      if (flatDistance(entity.position, point) > RADIUS + (entity.body?.radius ?? 0.4) || Math.abs(entity.position.y - point.y) > 6) continue;
      const hold = entity.warden ? BOSS_TRAP_TICKS : TRAP_TICKS;
      addStatus(entity, { kind: 'stun', ticksLeft: hold, power: 0, sourceId: casterId });
      addStatus(entity, { kind: 'caged', ticksLeft: hold, power: 0, sourceId: casterId });
      if (entity.creature) entity.creature.stun = Math.max(entity.creature.stun ?? 0, hold);
      applyDamage(ctx, entity.id, Math.round(SLAM_DAMAGE + spent * SLAM_PER_STAMINA), casterId, 'ability', 'shadow');
      if (!isHittable(entity)) continue;
      addStatus(entity, { kind: 'crush', ticksLeft: CRUSH_SECONDS * TICK_HZ, power: perSecond, sourceId: casterId });
      hit.push(entity.id);
    }
    return hit;
  },
};
