import type { ContentDef, ModelLoader } from '../../types';

/**
 * Hades's look (SPEC §5; approved concept `docs/reference/hades-concept.html`).
 * Only the model exists so far: M5.1 uses it for his story scene and M6 turns
 * this into a full `GodDef` (stats, the Shadow bident and his kit) in the
 * `gods` registry. Until the team signs off the in-game model on
 * `?preview=characters`, it stays unapproved.
 */
export const hadesLook: ContentDef & { name: string; model: ModelLoader } = {
  id: 'hades',
  name: 'Hades',
  approved: false,
  model: () => import('./model'),
};
