import { fbm, ridged, smoothstep } from './noise';

/**
 * The hand-tuned Refuge meadow at the foot of Olympus (SPEC §3.1), ported
 * from docs/reference/style-test.html. World units are metres; the hero rock
 * sits at the origin and Olympus rises far to the north-east (-z).
 */

/** Sea level. */
export const WATER_LEVEL = -24;

export function meadowHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.006 + 3.1, z * 0.006 + 7.7) - 0.5) * 52;
  h += (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 5;
  h -= 30 * smoothstep(55, 330, r);
  h += 15 * Math.exp(-(r * r) / (2 * 42 * 42));
  const m = smoothstep(450, 1100, r);
  if (m > 0) h += m * ridged(x * 0.0032, z * 0.0032) * 190;
  return h;
}

/** Ground height under the hero rock. */
export const MEADOW_ORIGIN_HEIGHT = meadowHeightAt(0, 0);
/** Standing height on top of the hero rock (where Zeus stands). */
export const HERO_ROCK_TOP = MEADOW_ORIGIN_HEIGHT + 0.7 + 0.72 * 2.5;
/** Centre of the blossom glade where fireflies and glowing flora gather. */
export const GLADE_CENTER = { x: 17, y: meadowHeightAt(17, -24), z: -24 } as const;
