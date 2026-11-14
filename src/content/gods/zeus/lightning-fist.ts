import type { ChargedMove } from '../../../sim/abilities';
import { applyDamage, chestPoint, knockBack, targetsNear } from '../../../sim/combat';
import { ticks } from '../../../sim/constants';

/** Hit frame of the punch; the lunge covers its distance before this. */
const HIT_TICK = 5;
/** A nearby enemy within this range takes an arc of lightning. */
const ARC_RANGE = 5;
const ARC_FRACTION = 0.4;

/**
 * Zeus's D: hold to charge a crackling fist (up to 1 s), release to lunge
 * 2–4 m and land an electrified punch: 20–45 damage by charge, knockback, and
 * an arc of lightning to one nearby enemy. 15–30 stamina by charge.
 */
export const lightningFist: ChargedMove = {
  id: 'lightning-fist',
  name: 'Lightning Fist',
  element: 'lightning',
  fullChargeTicks: ticks(1),
  staminaMin: 15,
  staminaMax: 30,
  cooldownTicks: ticks(2),
  attack(power) {
    const lungeMetres = 2 + 2 * power;
    return {
      damage: 20 + 25 * power,
      range: 2.1,
      arcDeg: 90,
      hitTick: HIT_TICK,
      totalTicks: 15,
      staminaCost: 0, // spent when the charge is released
      cleave: false,
      lunge: lungeMetres / ((HIT_TICK - 1) / 30), // the lunge moves on the ticks before the hit
    };
  },
  onHit(ctx, casterId, targetId, power) {
    const caster = ctx.world.entities[casterId];
    const target = ctx.world.entities[targetId];
    if (!caster || !target) return;
    knockBack(ctx, targetId, caster.position, 6 + 6 * power, ticks(0.25), ticks(0.5));
    const arc = targetsNear(ctx.world, target.position, ARC_RANGE, new Set([casterId, targetId]))[0];
    const points = [chestPoint(target)];
    const hitIds = [targetId];
    if (arc) {
      points.push(chestPoint(ctx.world.entities[arc]));
      applyDamage(ctx, arc, (20 + 25 * power) * ARC_FRACTION, casterId, 'ability');
      hitIds.push(arc);
    } else {
      // A short spark burst off the target so the hit always reads as lightning.
      points.push({ ...points[0], y: points[0].y + 0.9 });
    }
    ctx.emit('ability:cast', { casterId, abilityId: 'lightning-fist', targetIds: hitIds, points });
  },
};
