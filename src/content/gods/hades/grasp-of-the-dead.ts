import type { ChargedMove } from '../../../sim/abilities';
import { addStatus, knockBack } from '../../../sim/combat';
import { ticks } from '../../../sim/constants';

/**
 * Hades's D: charge up to 1 s, then slam the ground. Spectral hands rise in a
 * 3–5 m ring around him (by charge): 18–40 damage, they root enemies for 1–2 s
 * and drag them toward him. 15–30 stamina, 2 s cooldown.
 */
export const graspOfTheDead: ChargedMove = {
  id: 'grasp-of-the-dead',
  name: 'Grasp of the Dead',
  element: 'shadow',
  fullChargeTicks: ticks(1),
  staminaMin: 15,
  staminaMax: 30,
  cooldownTicks: ticks(2),
  attack(power) {
    return {
      damage: 18 + 22 * power,
      range: 3 + 2 * power,
      arcDeg: 360,
      hitTick: 6,
      totalTicks: 16,
      staminaCost: 0,
      cleave: true,
      lunge: 0,
    };
  },
  onHit(ctx, casterId, targetId, power) {
    const caster = ctx.world.entities[casterId];
    const target = ctx.world.entities[targetId];
    if (!caster || !target) return;
    const root = Math.round(ticks(1) + ticks(1) * power);
    addStatus(target, { kind: 'stun', ticksLeft: root, power: 0, sourceId: casterId });
    if (target.creature) target.creature.stun = Math.max(target.creature.stun ?? 0, root);
    // Pull toward Hades: knock "away" from a point on the far side of the target.
    const away = { x: target.position.x * 2 - caster.position.x, y: target.position.y, z: target.position.z * 2 - caster.position.z };
    knockBack(ctx, targetId, away, 5, ticks(0.25), root);
  },
  ring: true,
};
