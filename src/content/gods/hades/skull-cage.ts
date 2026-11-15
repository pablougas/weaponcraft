import type { UltimateModule } from '../../../sim/abilities';
import { addStatus, flatDistance, isHittable } from '../../../sim/combat';
import { ticks, TICK_HZ } from '../../../sim/constants';
import { groundAt, regionOf, sameRegion } from '../../../sim/regions';
import type { EntityId } from '../../../sim/types';
import { aimPoint, lockedTarget } from '../zeus/aim';

const RADIUS = 4;
const DAMAGE_PER_STAMINA = 1.2;
const TRAP_TICKS = ticks(4);
const CRUSH_SECONDS = 3;
const AIM_DISTANCE = 10;

/**
 * Hades's R: needs at least half stamina and spends all of it. A red warning
 * ring marks the spot for 1.5 s (the lock-on target, or 10 m ahead), then a
 * cage of bone drops (4 m): everything inside is trapped for 4 s and crushed
 * for 1.2 × stamina spent over 3 s. Same fairness rules as Sky Strike: the
 * marker always comes first and nothing flashes.
 */
export const skullCage: UltimateModule = {
  id: 'skull-cage',
  icon: 'cage',
  name: 'Skull Cage',
  element: 'shadow',
  cooldownTicks: ticks(12),
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
      addStatus(entity, { kind: 'stun', ticksLeft: TRAP_TICKS, power: 0, sourceId: casterId });
      if (entity.creature) entity.creature.stun = Math.max(entity.creature.stun ?? 0, TRAP_TICKS);
      addStatus(entity, { kind: 'crush', ticksLeft: CRUSH_SECONDS * TICK_HZ, power: perSecond, sourceId: casterId });
      hit.push(entity.id);
    }
    return hit;
  },
};
