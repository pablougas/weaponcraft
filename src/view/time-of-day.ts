/**
 * Lighting keyframes across a full day, keyed by day fraction
 * (0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk; see sim/time.ts).
 *
 * Golden hour, dusk and night are copied exactly from the approved style test
 * (its K[0], K[1], K[2]). Dawn and noon are new, extrapolated from the spec
 * palette (sky blue #7FB2E5, haze #C9DCEB, sun gold #FFC870). Values between
 * keyframes are blended linearly; the sun direction is lerped and normalized.
 */

export interface LightingKey {
  /** Day fraction this keyframe sits at. */
  at: number;
  /** Direction toward the sun (or the moon at night). */
  sun: [number, number, number];
  sunCol: string;
  sunI: number;
  hemiS: string;
  hemiG: string;
  hemiI: number;
  fog: string;
  fogD: number;
  zen: string;
  hor: string;
  skySun: string;
  cLit: string;
  cDark: string;
  gnd: string;
  bloomS: number;
  bloomT: number;
  rays: number;
  rim: string;
  rimS: number;
  amb: string;
  disc: number;
  sh: [number, number, number];
  hi: [number, number, number];
  exp: number;
  outline: string;
  /** 0 = day … 1 = full night (stars, glow flora, water darkening). */
  night: number;
  /** Particle and bird visibility. */
  fireflies: number;
  motes: number;
  birds: number;
}

// The style test's three keyframes (t = 0, 0.5, 1 there). The particle/bird
// amounts are the style test's formulas evaluated at those t values.
const GOLDEN: Omit<LightingKey, 'at'> = {
  sun: [-0.78, 0.24, -0.58], sunCol: '#ffcf8a', sunI: 3.4, hemiS: '#a7c8ea', hemiG: '#6b5a3a', hemiI: 1.15,
  fog: '#a8c1df', fogD: 0.00088, zen: '#2f6cc0', hor: '#f0d2a0', skySun: '#ffd49a', cLit: '#fff0d6', cDark: '#7083ad',
  gnd: '#8aa0b8', bloomS: 0.45, bloomT: 0.95, rays: 0.95, rim: '#ffd27a', rimS: 0.85, amb: '#5f7590', disc: 12,
  sh: [0.1, 0.2, 0.5], hi: [0.6, 0.42, 0.12], exp: 0.92, outline: '#1a1a33',
  night: 0, fireflies: 0, motes: 0.55, birds: 1,
};
const DUSK: Omit<LightingKey, 'at'> = {
  sun: [-0.85, 0.05, -0.5], sunCol: '#ff8f5c', sunI: 2.0, hemiS: '#8a86c0', hemiG: '#4a3a4a', hemiI: 0.85,
  fog: '#9488ad', fogD: 0.00115, zen: '#283a7a', hor: '#ff9f6a', skySun: '#ff9a66', cLit: '#ffb48a', cDark: '#4b4673',
  gnd: '#4d4a6c', bloomS: 0.7, bloomT: 0.75, rays: 0.8, rim: '#ff9a6a', rimS: 0.85, amb: '#4b4a72', disc: 18,
  sh: [0.2, 0.15, 0.5], hi: [0.6, 0.3, 0.2], exp: 1.0, outline: '#1b1530',
  night: 0.1338, fireflies: 0.2593, motes: 0.1936, birds: 0.9259,
};
const NIGHT: Omit<LightingKey, 'at'> = {
  sun: [0.35, 0.5, -0.79], sunCol: '#8fb0ff', sunI: 0.9, hemiS: '#3d5c9c', hemiG: '#0f1628', hemiI: 0.75,
  fog: '#16264a', fogD: 0.0009, zen: '#040a20', hor: '#1a3263', skySun: '#c9d9ff', cLit: '#3d5285', cDark: '#0e1632',
  gnd: '#0c1326', bloomS: 0.8, bloomT: 0.62, rays: 0.25, rim: '#5ff0e0', rimS: 0.42, amb: '#203a6a', disc: 3,
  sh: [0.05, 0.15, 0.4], hi: [0.1, 0.5, 0.5], exp: 1.05, outline: '#070b1c',
  night: 1, fireflies: 1, motes: 0, birds: 0,
};
// New: sunrise in the east (+x), pink-gold and a little hazy.
const DAWN: Omit<LightingKey, 'at'> = {
  sun: [0.82, 0.12, -0.45], sunCol: '#ffb88a', sunI: 2.3, hemiS: '#a3b6dc', hemiG: '#5a4a48', hemiI: 0.95,
  fog: '#c4b9d2', fogD: 0.0011, zen: '#3f66b0', hor: '#f6c2a2', skySun: '#ffc39a', cLit: '#ffe1cf', cDark: '#7a7ea6',
  gnd: '#7c88a6', bloomS: 0.55, bloomT: 0.85, rays: 0.7, rim: '#ffb89a', rimS: 0.8, amb: '#56638a', disc: 14,
  sh: [0.15, 0.18, 0.5], hi: [0.55, 0.35, 0.25], exp: 0.97, outline: '#1b1830',
  night: 0.15, fireflies: 0.15, motes: 0.3, birds: 0.8,
};
// New: high sun, clear blue sky, palette haze; calmer bloom and rays.
const NOON: Omit<LightingKey, 'at'> = {
  sun: [-0.25, 0.92, -0.3], sunCol: '#fff3dc', sunI: 3.6, hemiS: '#b9d6f2', hemiG: '#6b6a4a', hemiI: 1.3,
  fog: '#c9dceb', fogD: 0.00075, zen: '#3f7fd0', hor: '#c9dceb', skySun: '#fff2d6', cLit: '#ffffff', cDark: '#8ea3c4',
  gnd: '#93a7bd', bloomS: 0.3, bloomT: 1.0, rays: 0.35, rim: '#fff0c8', rimS: 0.6, amb: '#6f88a8', disc: 10,
  sh: [0.08, 0.16, 0.4], hi: [0.4, 0.35, 0.2], exp: 0.9, outline: '#1a1c33',
  night: 0, fireflies: 0, motes: 0.45, birds: 1,
};

/** Day fractions of the named looks (used by tests and the dev menu). */
export const TIME_OF_DAY_PRESETS = {
  dawn: 0.25,
  noon: 0.5,
  golden: 0.7,
  dusk: 0.77,
  night: 0.92,
} as const;

/** Sorted keyframes covering [0, 1]; night holds from 0.85 through 0.18. */
export const LIGHTING_KEYS: readonly LightingKey[] = [
  { at: 0, ...NIGHT },
  { at: 0.18, ...NIGHT },
  { at: TIME_OF_DAY_PRESETS.dawn, ...DAWN },
  { at: TIME_OF_DAY_PRESETS.noon, ...NOON },
  { at: TIME_OF_DAY_PRESETS.golden, ...GOLDEN },
  { at: TIME_OF_DAY_PRESETS.dusk, ...DUSK },
  { at: 0.85, ...NIGHT },
  { at: 1, ...NIGHT },
];

/** The two keyframes around `dayFraction` and the blend factor between them. */
export function lightingSegment(dayFraction: number): { a: LightingKey; b: LightingKey; f: number } {
  const t = ((dayFraction % 1) + 1) % 1;
  for (let i = 0; i < LIGHTING_KEYS.length - 1; i += 1) {
    const a = LIGHTING_KEYS[i];
    const b = LIGHTING_KEYS[i + 1];
    if (t >= a.at && t <= b.at) {
      return { a, b, f: b.at === a.at ? 0 : (t - a.at) / (b.at - a.at) };
    }
  }
  return { a: LIGHTING_KEYS[0], b: LIGHTING_KEYS[0], f: 0 };
}

export function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}
