import { addStatus, isHittable } from '../../sim/combat';
import { ticks } from '../../sim/constants';
import type { Entity } from '../../sim/types';
import type { SpiritDef } from './index';
import { shadowDaggers } from './shadow-daggers';

/** Three-Fold Howl's numbers (SPEC §6 table: AoE fear + lifesteal for 6 s; plus lingering dread damage). */
export const HOWL = {
  radius: 10,
  /** Enemies in range run in fear (soldiers break and flee; wildlife bolts). */
  fearTicks: ticks(6),
  /** The god heals this share of all damage dealt while it lasts. */
  lifesteal: 0.3,
  lifestealTicks: ticks(6),
  /** 20 s → 10 s (team request, Nov 15) → 7 s (team request, Nov 16). */
  cooldownTicks: ticks(7),
  staminaCost: 30,
  /** Dread: every enemy in range keeps taking this much a second for a while after (team request, Nov 15). */
  dreadPerSecond: 6,
  dreadTicks: ticks(4),
} as const;

/**
 * Cerberus, Hound of the Gate (M7): freed from the Mk. II, he bonds with both
 * gods. Zeus gets his Three-Fold Howl; Hades, his old master, gets Shadow
 * Daggers (team request, Nov 15).
 */
export const cerberus: SpiritDef = {
  id: 'cerberus',
  name: 'Cerberus, Hound of the Gate',
  approved: true,
  freedFlag: 'cerberusFreed',
  forGods: { hades: shadowDaggers },
  ability: {
    id: 'three-fold-howl',
    name: 'Three-Fold Howl',
    cooldownTicks: HOWL.cooldownTicks,
    staminaCost: HOWL.staminaCost,
    icon: 'howl',
    cast(ctx, casterId) {
      const caster = ctx.world.entities[casterId];
      if (!caster?.hero) return false;
      const feared: string[] = [];
      for (const e of Object.values(ctx.world.entities)) {
        if (e.id === casterId || e.hero || !isHittable(e) || (e.region ?? 'surface') !== (caster.region ?? 'surface')) continue;
        if (Math.hypot(e.position.x - caster.position.x, e.position.z - caster.position.z) > HOWL.radius) continue;
        if (fear(e)) feared.push(e.id);
        // Dread lingers on everything it reached, machines included (they don't flee, but they still hurt).
        addStatus(e, { kind: 'dread', ticksLeft: HOWL.dreadTicks, power: HOWL.dreadPerSecond, sourceId: casterId });
      }
      caster.hero.howl = HOWL.lifestealTicks;
      ctx.emit('ability:cast', { casterId, abilityId: 'three-fold-howl', targetIds: feared, points: [{ ...caster.position }] });
      return true;
    },
  },
};

/** Sends a soldier or creature running. Machines (the Mk. II's plating) don't feel fear. */
function fear(e: Entity): boolean {
  if (e.soldier) {
    e.soldier.state = 'flee';
    e.soldier.timer = 0;
    e.soldier.windup = 0;
    return true;
  }
  if (e.creature && !e.mechPart && e.creature.wanders) {
    e.creature.flee = HOWL.fearTicks;
    e.creature.target = null;
    return true;
  }
  return false;
}
