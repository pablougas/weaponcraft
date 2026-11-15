import type { ContentDef, ModelLoader } from '../../types';

/**
 * Hades's look (SPEC §5; approved concept `docs/reference/hades-concept.html`).
 * Only the model exists so far: M5.1 uses it for his story scene and M6 turns
 * this into a full `GodDef` (stats, the Shadow bident and his kit) in the
 * `gods` registry. The team approved the in-game model on Nov 14
 * (`?preview=characters`).
 */
export const hadesLook: ContentDef & { name: string; model: ModelLoader } = {
  id: 'hades',
  name: 'Hades',
  approved: true,
  model: () => import('./model'),
};
