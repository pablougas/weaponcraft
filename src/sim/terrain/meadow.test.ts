import { describe, expect, it } from 'vitest';
import { GLADE_CENTER, HERO_ROCK_TOP, meadowHeightAt, WATER_LEVEL } from './meadow';
import { fbm, smoothstep } from './noise';

describe('meadow terrain', () => {
  it('is deterministic', () => {
    expect(meadowHeightAt(12.5, -40)).toBe(meadowHeightAt(12.5, -40));
  });

  it('keeps the meadow above water and the far ring mountainous', () => {
    expect(meadowHeightAt(0, 0)).toBeGreaterThan(WATER_LEVEL + 5);
    expect(GLADE_CENTER.y).toBeGreaterThan(WATER_LEVEL);
    expect(HERO_ROCK_TOP).toBeGreaterThan(meadowHeightAt(0, 0));
    const ring = [0, 1, 2, 3, 4, 5].map((i) => meadowHeightAt(Math.cos(i) * 1200, Math.sin(i) * 1200));
    expect(Math.max(...ring)).toBeGreaterThan(40);
  });

  it('noise helpers stay in range', () => {
    for (let i = 0; i < 200; i += 1) {
      const n = fbm(i * 0.37, i * -0.11);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(1, 0, 0.25)).toBeCloseTo(1 - smoothstep(0, 1, 0.25));
  });
});
