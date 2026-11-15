import type { ContentDef } from '../types';
import type { SimContext } from '../../sim/world';
import type { EntityId } from '../../sim/types';
import { cerberus } from './cerberus';

/** A spirit's gift to the gods once it's freed (SPEC §6): one ability on E for every god. */
export interface SpiritAbility {
  id: string;
  name: string;
  cooldownTicks: number;
  staminaCost: number;
  /** HUD glyph (ui/hud.ts GLYPHS); defaults to the howl. */
  icon?: string;
  /** Performs the ability for the caster. Returns false if it did nothing (nothing is spent). */
  cast(ctx: SimContext, casterId: EntityId): boolean;
  /** Runs every authority tick for each god who has this ability (lasting effects). */
  tick?(ctx: SimContext, casterId: EntityId): void;
}

/** A freed spirit (M7): which world flag frees it, and the ability it grants. */
export interface SpiritDef extends ContentDef {
  name: string;
  /** World flag set when the spirit is freed (e.g. 'cerberusFreed'). */
  freedFlag: string;
  ability: SpiritAbility;
  /** A different gift for a particular god, by god ID (Hades gets Shadow Daggers instead of the howl). */
  forGods?: Readonly<Record<string, SpiritAbility>>;
}

/** The ability this spirit lends to this god. */
export function spiritAbilityFor(spirit: SpiritDef, godId: string): SpiritAbility {
  return spirit.forGods?.[godId] ?? spirit.ability;
}

// Registry: add a file in this folder and one line here. Never edit the engine.
export const spirits: readonly SpiritDef[] = [cerberus];
