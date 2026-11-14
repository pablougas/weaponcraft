import type { AbilityModule } from '../../../sim/abilities';
import { applyDamage, chestPoint, isHittable, targetsNear } from '../../../sim/combat';
import { ticks } from '../../../sim/constants';
import type { EntityId, Vec3 } from '../../../sim/types';
import { aimPoint, aimYaw } from './aim';

/** First target within this range (or the lock-on target within LOCK_RANGE). */
const FIRST_RANGE = 14;
const LOCK_RANGE = 18;
/** Each jump reaches the nearest new target within this range. */
const CHAIN_RANGE = 7;
const MAX_TARGETS = 4;
const BASE_DAMAGE = 18;
/** Each jump does this fraction of the previous one. */
const FALLOFF = 0.8;
/** With nothing to chain to, the bolt strikes the ground ahead and splashes this wide… */
const GROUND_RANGE = 14;
const SPLASH_RADIUS = 1.5;
/** …for this fraction of the base damage. */
const SPLASH_FRACTION = 0.5;

/**
 * Zeus's Q: a bolt leaps from the spear to the nearest enemy (or the locked
 * target) and chains to up to three more nearby, weakening with each jump.
 * With no target it still fires, striking the ground ahead along the aim.
 * Holding Q keeps firing every 0.3 s until stamina runs out (M3.1).
 */
export const chainLightning: AbilityModule = {
  id: 'chain-lightning',
  name: 'Chain Lightning',
  element: 'lightning',
  cooldownTicks: ticks(0.3),
  staminaCost: 8,
  repeatWhileHeld: true,
  cast(ctx, casterId) {
    const { world } = ctx;
    const caster = world.entities[casterId];
    if (!caster) return false;
    const visited = new Set<EntityId>([casterId]);
    const origin: Vec3 = { x: caster.position.x, y: caster.position.y + 2.2, z: caster.position.z };

    let first: EntityId | undefined;
    const lock = caster.hero?.lockTarget;
    if (lock && isHittable(world.entities[lock])) {
      const target = world.entities[lock];
      if (Math.hypot(target.position.x - caster.position.x, target.position.z - caster.position.z) <= LOCK_RANGE) first = lock;
    }
    first ??= targetsNear(world, caster.position, FIRST_RANGE, visited)[0];

    if (!first) {
      // Nothing in range: strike the ground ahead and splash whatever stands there.
      caster.rotationY = aimYaw(caster);
      const point = aimPoint(caster, GROUND_RANGE);
      const splashed = targetsNear(world, point, SPLASH_RADIUS, visited);
      for (const id of splashed) applyDamage(ctx, id, BASE_DAMAGE * SPLASH_FRACTION, casterId, 'ability');
      ctx.emit('ability:cast', { casterId, abilityId: this.id, targetIds: splashed, points: [origin, { ...point, y: point.y + 0.05 }] });
      return true;
    }

    const target = world.entities[first];
    caster.rotationY = Math.atan2(target.position.x - caster.position.x, target.position.z - caster.position.z);
    const chain: EntityId[] = [];
    let current: EntityId | undefined = first;
    while (current && chain.length < MAX_TARGETS) {
      chain.push(current);
      visited.add(current);
      current = targetsNear(world, world.entities[current].position, CHAIN_RANGE, visited)[0];
    }
    // Record where each target stood before damage (defeated wildlife may be removed later).
    const points = [origin, ...chain.map((id) => chestPoint(world.entities[id]))];
    chain.forEach((id, i) => applyDamage(ctx, id, BASE_DAMAGE * FALLOFF ** i, casterId, 'ability'));
    ctx.emit('ability:cast', { casterId, abilityId: this.id, targetIds: chain, points });
    return true;
  },
};
