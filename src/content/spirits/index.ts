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
  /** Performs the ability for the caster. Returns false if it did nothing (nothing is spent). */
  cast(ctx: SimContext, casterId: EntityId): boolean;
}

/** A freed spirit (M7): which world flag frees it, and the ability it grants. */
export interface SpiritDef extends ContentDef {
  name: string;
  /** World flag set when the spirit is freed (e.g. 'cerberusFreed'). */
  freedFlag: string;
  ability: SpiritAbility;
}

// Registry: add a file in this folder and one line here. Never edit the engine.
export const spirits: readonly SpiritDef[] = [cerberus];
