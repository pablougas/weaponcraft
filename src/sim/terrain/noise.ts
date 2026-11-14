/**
 * Deterministic value noise for terrain (ported from the style test). Pure
 * functions of position: no Math.random(), so sim and view always agree.
 */

export function hash2(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fractal Brownian motion: `octaves` layers of value noise. */
export function fbm(x: number, y: number, octaves = 5): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * valueNoise(x * frequency, y * frequency);
    frequency *= 2.02;
    amplitude *= 0.5;
  }
  return sum;
}

/** Ridged noise for mountain ranges. */
export function ridged(x: number, y: number): number {
  let sum = 0;
  let amplitude = 0.55;
  let frequency = 1;
  for (let i = 0; i < 5; i += 1) {
    const n = 1 - Math.abs(valueNoise(x * frequency + i * 7.3, y * frequency) * 2 - 1);
    sum += amplitude * n * n;
    frequency *= 2.1;
    amplitude *= 0.5;
  }
  return sum;
}

/** Hermite smoothstep from a to b (a > b allowed for a falling edge). */
export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
