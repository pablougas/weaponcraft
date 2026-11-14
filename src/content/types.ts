/**
 * Fields every content definition shares. Each registry's def type extends
 * this as its milestone fills it in (see SPEC §12).
 */
export interface ContentDef {
  /** Stable, unique ID within its registry, e.g. `"zeus"` or `"bronze-spear"`. */
  id: string;
  /** Unapproved content only appears on `?preview=<type>`, never in normal play. */
  approved: boolean;
}
