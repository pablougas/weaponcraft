import { spiritAbilityFor, spirits, type SpiritDef } from '../../content/spirits';
import type { Entity, HeroState, WorldState } from '../types';
import type { SimContext } from '../world';

/** The freed spirit whose ability is on E, if any (the first freed, in registry order). */
export function activeSpirit(world: WorldState): SpiritDef | undefined {
  return spirits.find((s) => s.approved && world.flags[s.freedFlag]);
}

/** E: casts the freed spirit's ability for this god (each god has his own gift and cooldown). */
export function castSpirit(ctx: SimContext, entity: Entity & { hero: HeroState }): string | null {
  const spirit = activeSpirit(ctx.world);
  if (!spirit) return 'no spirit';
  const ability = spiritAbilityFor(spirit, entity.defId);
  const hero = entity.hero;
  if ((hero.cooldowns[ability.id] ?? 0) > 0) return 'cooling down';
  if (!entity.stamina || entity.stamina.current < ability.staminaCost) return 'no stamina';
  if (!ability.cast(ctx, entity.id)) return 'no effect';
  entity.stamina.current -= ability.staminaCost;
  hero.cooldowns[ability.id] = ability.cooldownTicks;
  return null;
}

/** Ticks down spirit effects on the gods (the howl's lifesteal, Hades's circling daggers). */
export function updateSpirits(ctx: SimContext): void {
  const spirit = activeSpirit(ctx.world);
  for (const entity of Object.values(ctx.world.entities)) {
    if (!entity.hero) continue;
    if (entity.hero.howl) entity.hero.howl = Math.max(0, entity.hero.howl - 1);
    if (spirit && ctx.isAuthority && !ctx.world.cutscene) spiritAbilityFor(spirit, entity.defId).tick?.(ctx, entity.id);
  }
}
