import type { ContentDef, ModelLoader } from '../types';
import { poseidon } from './poseidon';

/** A story character who isn't playable (yet): a name and a model. Behaviour comes from cutscenes and `npc` state. */
export interface CharacterDef extends ContentDef {
  name: string;
  model: ModelLoader;
}

// Registry: add a folder here and one line below. Never edit the engine.
export const characters: readonly CharacterDef[] = [poseidon];
