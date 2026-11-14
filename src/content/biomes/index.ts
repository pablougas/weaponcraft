import type { ContentDef } from '../types';

/** Filled in by M6 (world generation). */
export type BiomeDef = ContentDef;

// Registry: add a file in this folder and one line here. Never edit the engine.
export const biomes: readonly BiomeDef[] = [];
