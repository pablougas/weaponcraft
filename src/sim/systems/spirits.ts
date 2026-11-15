import { spirits, type SpiritDef } from '../../content/spirits';
import type { Entity, HeroState, WorldState } from '../types';
import type { SimContext } from '../world';

/** The freed spirit whose ability is on E, if any (the first freed, in registry order). */
export function activeSpirit(world: WorldState): SpiritDef | undefined {
  return spirits.find((s) => s.approved && world.flags[s.freedFlag]);
}

/** E: casts the freed spirit's ability for this god (both gods share it; each has its own cooldown). */
export function castSpirit(ctx: SimContext, entity: Entity & { hero: HeroState }): string | null {
  const spirit = activeSpirit(ctx.world);
  if (!spirit) return 'no spirit';
  const ability = spirit.ability;
  const hero = entity.hero;
  if ((hero.cooldowns[ability.id] ?? 0) > 0) return 'cooling down';
  if (!entity.stamina || entity.stamina.current < ability.staminaCost) return 'no stamina';
  if (!ability.cast(ctx, entity.id)) return 'no effect';
  entity.stamina.current -= ability.staminaCost;
  hero.cooldowns[ability.id] = ability.cooldownTicks;
  return null;
}

/** Ticks down spirit effects on the gods (Three-Fold Howl's lifesteal). */
export function updateSpirits(ctx: SimContext): void {
  for (const entity of Object.values(ctx.world.entities)) {
    if (entity.hero?.howl) entity.hero.howl = Math.max(0, entity.hero.howl - 1);
  }
}
