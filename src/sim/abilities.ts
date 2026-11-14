import type { EntityId } from './types';
import type { SimContext } from './world';

/**
 * A god or spirit ability (Q / E). Content provides these as small modules;
 * the sim calls `cast` when the player presses the key and the cooldown is up.
 */
export interface AbilityModule {
  id: string;
  name: string;
  element: 'light' | 'shadow' | 'poison' | 'lightning';
  cooldownTicks: number;
  staminaCost: number;
  /** Returns false if nothing happened (e.g. no target), so no cooldown or stamina is spent. */
  cast(ctx: SimContext, casterId: EntityId): boolean;
  /** Optional per-tick behaviour for lasting abilities. */
  update?(ctx: SimContext, casterId: EntityId): void;
}
