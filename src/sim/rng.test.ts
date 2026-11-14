import { describe, expect, it } from 'vitest';
import { rng, worldRng } from './rng';
import { createWorld } from './world';

const draw = (seed: number, stream: string, n = 20) => {
  const r = rng(seed, stream);
  return Array.from({ length: n }, () => r.next());
};

describe('rng', () => {
  it('repeats exactly for the same seed and stream', () => {
    expect(draw(42, 'loot')).toEqual(draw(42, 'loot'));
  });

  it('differs between seeds and between streams', () => {
    expect(draw(42, 'loot')).not.toEqual(draw(43, 'loot'));
    expect(draw(42, 'loot')).not.toEqual(draw(42, 'worldgen'));
  });

  it('stays in range', () => {
    const r = rng(7, 'range');
    for (let i = 0; i < 2000; i += 1) {
      const f = r.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = r.int(-3, 4);
      expect(Number.isInteger(n) && n >= -3 && n < 4).toBe(true);
    }
  });

  it('is roughly uniform', () => {
    const r = rng(1, 'uniform');
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 10000; i += 1) buckets[Math.floor(r.next() * 10)] += 1;
    for (const count of buckets) expect(count).toBeGreaterThan(850);
  });

  it('resumes from a saved state', () => {
    const a = rng(9, 's');
    a.next();
    a.next();
    const b = rng(9, 's', a.state);
    expect(b.next()).toBe(a.next());
  });

  it('worldRng continues across calls and survives a save round-trip', () => {
    const world = createWorld(5, 0);
    const first = worldRng(world, 'ai').next();
    const copy = structuredClone(world);
    const second = worldRng(world, 'ai').next();
    expect(second).not.toBe(first);
    expect(worldRng(copy, 'ai').next()).toBe(second);
    expect(draw(5, 'ai', 2)).toEqual([first, second]);
  });

  it('pick throws on an empty list', () => {
    expect(() => rng(1, 'x').pick([])).toThrow();
  });
});
