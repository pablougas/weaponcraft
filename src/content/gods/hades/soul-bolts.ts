import type { AbilityModule } from '../../../sim/abilities';
import { applyDamage, chestPoint, isHittable, targetsNear } from '../../../sim/combat';
import { ticks } from '../../../sim/constants';
import { sameRegion } from '../../../sim/regions';
import type { EntityId, Vec3 } from '../../../sim/types';
import { aimPoint, aimYaw } from '../zeus/aim';

const RANGE = 16;
const DAMAGE = 16;
/** With no target the skull flies this far ahead and bursts. */
const FREE_RANGE = 14;
const BURST_RADIUS = 1.4;

/**
 * Hades's Q: hold to keep firing homing shadow skulls (every 0.35 s, 8
 * stamina, 16 damage, 16 m). Shadow damage heals him (the Shadow element's
 * lifesteal, 25% of damage). With no target they fly 14 m ahead.
 */
export const soulBolts: AbilityModule = {
  id: 'soul-bolts',
  icon: 'soul',
  name: 'Soul Bolts',
  element: 'shadow',
  cooldownTicks: ticks(0.35),
  staminaCost: 8,
  repeatWhileHeld: true,
  cast(ctx, casterId) {
    const { world } = ctx;
    const caster = world.entities[casterId];
    if (!caster) return false;
    const origin: Vec3 = { x: caster.position.x, y: caster.position.y + 1.7, z: caster.position.z };
    let target: EntityId | undefined;
    const lock = caster.hero?.lockTarget;
    const locked = lock ? world.entities[lock] : undefined;
    if (locked && isHittable(locked) && sameRegion(locked, caster)
      && Math.hypot(locked.position.x - caster.position.x, locked.position.z - caster.position.z) <= RANGE) target = lock!;
    target ??= targetsNear(world, caster.position, RANGE, new Set([casterId])).find((id) => sameRegion(world.entities[id], caster));
    if (!target) {
      caster.rotationY = aimYaw(caster);
      const point = aimPoint(caster, FREE_RANGE);
      const hit = targetsNear(world, point, BURST_RADIUS, new Set([casterId]));
      for (const id of hit) applyDamage(ctx, id, DAMAGE * 0.5, casterId, 'ability', 'shadow');
      ctx.emit('ability:cast', { casterId, abilityId: this.id, targetIds: hit, points: [origin, { ...point, y: point.y + 0.6 }] });
      return true;
    }
    const entity = world.entities[target];
    caster.rotationY = Math.atan2(entity.position.x - caster.position.x, entity.position.z - caster.position.z);
    const points = [origin, chestPoint(entity)];
    applyDamage(ctx, target, DAMAGE, casterId, 'ability', 'shadow');
    ctx.emit('ability:cast', { casterId, abilityId: this.id, targetIds: [target], points });
    return true;
  },
};
