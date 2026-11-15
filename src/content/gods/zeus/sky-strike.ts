import type { UltimateModule } from '../../../sim/abilities';
import { applyDamage, flatDistance, isHittable, knockBack } from '../../../sim/combat';
import { ticks } from '../../../sim/constants';
import type { EntityId } from '../../../sim/types';
import { groundAt, regionOf } from '../../../sim/regions';
import { aimPoint, lockedTarget } from './aim';

const RADIUS = 5;
/** Damage per point of stamina spent, at the centre. */
const DAMAGE_PER_STAMINA = 1.2;
/** Damage at the edge of the ring, as a fraction of the centre. */
const EDGE_FRACTION = 0.6;
/** Where it lands with no lock-on target: this far ahead along the aim. */
const AIM_DISTANCE = 12;

/**
 * Zeus's R, the supercharged bolt: needs at least half stamina and spends all
 * of it. A ring marks the spot for 0.6 s, then a huge bolt falls from the sky:
 * 5 m radius, damage 1.2 × stamina spent, knockback and a 1.5 s stun.
 */
export const skyStrike: UltimateModule = {
  id: 'sky-strike',
  name: 'Sky Strike',
  element: 'lightning',
  cooldownTicks: ticks(12),
  minStaminaFraction: 0.5,
  telegraphTicks: ticks(0.6),
  radius: RADIUS,
  target(ctx, casterId) {
    const caster = ctx.world.entities[casterId];
    if (!caster) return null;
    const lock = lockedTarget(ctx, caster);
    if (lock) return { x: lock.position.x, y: groundAt(regionOf(lock), lock.position.x, lock.position.z), z: lock.position.z };
    return aimPoint(caster, AIM_DISTANCE);
  },
  land(ctx, casterId, point, spent) {
    const hit: EntityId[] = [];
    for (const entity of Object.values(ctx.world.entities)) {
      if (entity.id === casterId || !isHittable(entity)) continue;
      const distance = flatDistance(entity.position, point);
      if (distance > RADIUS + (entity.body?.radius ?? 0.4) || Math.abs(entity.position.y - point.y) > 6) continue;
      const falloff = 1 - (1 - EDGE_FRACTION) * Math.min(1, distance / RADIUS);
      applyDamage(ctx, entity.id, spent * DAMAGE_PER_STAMINA * falloff, casterId, 'ability', 'lightning');
      knockBack(ctx, entity.id, point, 9, ticks(0.3), ticks(1.5));
      hit.push(entity.id);
    }
    return hit;
  },
};
