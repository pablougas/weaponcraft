import type { ContentDef, ModelLoader } from '../types';
import { fusionAltar } from './fusion-altar';

/** Buildings and props you interact with (the Fusion Altar; the Forge and bed come later). */
export interface StructureDef extends ContentDef {
  name: string;
  model: ModelLoader;
}

// Registry: add a folder here and one line below. Never edit the engine.
export const structures: readonly StructureDef[] = [fusionAltar];
