import type { ContentDef, ModelLoader } from '../types';
import { cerberusMk2 } from './cerberus-mk2';
import { krakenMech } from './kraken-mech';

/** A human war machine (SPEC §10). Its behaviour lives in sim/systems/mech.ts. */
export interface MechDef extends ContentDef {
  name: string;
  model: ModelLoader;
}

// Registry: add a folder here and one line below. Never edit the engine.
export const mechs: readonly MechDef[] = [cerberusMk2, krakenMech];
