import type { ContentDef, ModelLoader } from '../types';
import { bed } from './bed';
import { chest } from './chest';
import { forge } from './forge';
import { fusionAltar } from './fusion-altar';
import { keepDoor } from './keep-door';
import { seaGate } from './sea-gate';
import { glowPearl } from './glow-pearl';
import { houseDoor } from './house-door';
import { siegeRam } from './siege-ram';

/** Buildings and props you interact with: the Fusion Altar, the bed and the Forge. */
export interface StructureDef extends ContentDef {
  name: string;
  model: ModelLoader;
}

// Registry: add a folder here and one line below. Never edit the engine.
export const structures: readonly StructureDef[] = [fusionAltar, bed, forge, chest, seaGate, keepDoor, houseDoor, glowPearl, siegeRam];
