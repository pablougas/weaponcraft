import { applyDamage, chestPoint, isHittable } from '../../sim/combat';
import { TICK_HZ, ticks } from '../../sim/constants';
import { sameRegion } from '../../sim/regions';
import type { Entity, Vec3 } from '../../sim/types';
import type { SpiritAbility } from './index';

/** Shadow Daggers' numbers (team request, Nov 15: Cerberus's gift to Hades instead of the howl). */
export const DAGGERS = {
  count: 3,
  /** How long the daggers circle him. */
  durationTicks: ticks(15),
  /** A dagger flies at whatever Hades is locked on to (Tab) within this range. */
  range: 16,
  damage: 22,
  /** One dagger at a time: the next flies only after the last has landed (team request). */
  intervalTicks: ticks(0.8),
  /** A thrown dagger re-forms in the pyramid after this long. */
  reformTicks: ticks(3),
  cooldownTicks: ticks(20),
  staminaCost: 30,
  /**
   * The pyramid above his crown (team request): seen from behind, one dagger on
   * top and two below, close together, all lying flat and pointing the way he
   * faces. Half the gap between the lower two, the lower pair's height, and how
   * far the top one sits above them.
   */
  spread: 0.26,
  baseHeight: 2.6,
  peakRise: 0.3,
} as const;

/** The pyramid's gentle bob (the whole formation moves together, so it keeps its shape). */
function bob(seconds: number): number {
  return Math.sin(seconds * 2) * 0.05;
}

/** Each dagger's slot in the pyramid, in Hades's own frame: x along his local +X (sideways), y up. */
const SLOTS = [
  { x: 0, y: DAGGERS.peakRise },
  { x: -DAGGERS.spread, y: 0 },
  { x: DAGGERS.spread, y: 0 },
] as const;

/**
 * Where dagger `i` sits in the pyramid when Hades stands at `center` facing
 * `yaw`, at a given time (seconds). The sim throws from here and the view
 * draws them here, so the throw leaves from the dagger you see.
 */
export function daggerSlot(center: Vec3, yaw: number, i: number, seconds: number): Vec3 {
  const slot = SLOTS[i % SLOTS.length];
  // His local +X for heading `yaw` (the same axis three.js turns with rotation.y = yaw).
  return {
    x: center.x + Math.cos(yaw) * slot.x,
    y: center.y + DAGGERS.baseHeight + slot.y + bob(seconds),
    z: center.z - Math.sin(yaw) * slot.x,
  };
}

/** The enemy Hades is focused on (his lock-on), if a dagger can reach it. */
function focusOf(caster: Entity, world: { entities: Record<string, Entity> }): Entity | undefined {
  const id = caster.hero?.lockTarget;
  const target = id ? world.entities[id] : undefined;
  if (!target || target.hero || !isHittable(target) || !sameRegion(target, caster)) return undefined;
  if (Math.hypot(target.position.x - caster.position.x, target.position.z - caster.position.z) > DAGGERS.range) return undefined;
  return target;
}

/**
 * Hades's E once Cerberus is free: three shadow daggers hover in a pyramid above his crown for 15 s.
 * Whenever he locks on to an enemy, they throw themselves at it one after
 * another, one at a time (22 shadow damage each, so his lifesteal heals him) and re-form in
 * the pyramid 3 s later.
 */
export const shadowDaggers: SpiritAbility = {
  id: 'shadow-daggers',
  name: 'Shadow Daggers',
  icon: 'daggers',
  cooldownTicks: DAGGERS.cooldownTicks,
  staminaCost: DAGGERS.staminaCost,
  cast(ctx, casterId) {
    const caster = ctx.world.entities[casterId];
    if (!caster?.hero) return false;
    caster.hero.daggers = { ticksLeft: DAGGERS.durationTicks, reform: Array.from({ length: DAGGERS.count }, () => 0), nextShot: 0 };
    ctx.emit('ability:cast', { casterId, abilityId: 'shadow-daggers', targetIds: [], points: [{ ...caster.position }] });
    return true;
  },
  tick(ctx, casterId) {
    const caster = ctx.world.entities[casterId];
    const daggers = caster?.hero?.daggers;
    if (!caster?.hero || !daggers) return;
    daggers.ticksLeft -= 1;
    if (daggers.ticksLeft <= 0 || caster.hero.down != null || (caster.health && caster.health.current <= 0)) {
      caster.hero.daggers = null;
      return;
    }
    for (let i = 0; i < daggers.reform.length; i += 1) if (daggers.reform[i] > 0) daggers.reform[i] -= 1;
    if (daggers.nextShot > 0) {
      daggers.nextShot -= 1;
      return;
    }
    const target = focusOf(caster, ctx.world);
    const ready = daggers.reform.findIndex((r) => r === 0);
    if (!target || ready < 0) return;
    const from = daggerSlot(caster.position, caster.rotationY, ready, ctx.world.tick / TICK_HZ);
    daggers.reform[ready] = DAGGERS.reformTicks;
    daggers.nextShot = DAGGERS.intervalTicks;
    applyDamage(ctx, target.id, DAGGERS.damage, casterId, 'ability', 'shadow');
    ctx.emit('ability:cast', { casterId, abilityId: 'shadow-dagger', targetIds: [target.id], points: [from, chestPoint(target)] });
  },
};
