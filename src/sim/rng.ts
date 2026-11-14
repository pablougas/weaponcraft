import type { WorldState } from './types';

/**
 * Seeded random numbers for the sim (CLAUDE.md rule 6: never Math.random()).
 *
 * `rng(seed, stream)` gives an independent, reproducible sequence per named
 * stream ("worldgen", "loot", "ai"...), so adding draws to one system never
 * shifts another system's results.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, maxExclusive). */
  int(min: number, maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability `p`. */
  chance(p: number): boolean;
  /** A random element (throws on an empty array). */
  pick<T>(items: readonly T[]): T;
  /** Internal 32-bit state; pass it back to `rng()` to resume the sequence. */
  readonly state: number;
}

/** FNV-1a hash of a string to an unsigned 32-bit integer. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Initial state for a (seed, stream) pair. */
export function streamSeed(seed: number, stream: string): number {
  let h = (seed >>> 0) ^ hashString(stream);
  // murmur3 finalizer to spread nearby seeds apart
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Creates a generator for `stream` of `seed`. Pass `state` (from a previous
 * generator's `.state`) to continue where it left off.
 */
export function rng(seed: number, stream: string, state?: number): Rng {
  let s = (state ?? streamSeed(seed, stream)) >>> 0;
  const next = (): number => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, maxExclusive) => min + Math.floor(next() * (maxExclusive - min)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick() called with an empty array');
      return items[Math.floor(next() * items.length)];
    },
    get state() {
      return s;
    },
  };
}

/**
 * A generator for `stream` that continues from, and saves its position back
 * into, `world.rngStreams`. Use this for draws during ticks so results survive
 * save/load and replay identically.
 */
export function worldRng(world: WorldState, stream: string): Rng {
  const generator = rng(world.seed, stream, world.rngStreams[stream]);
  const save = <T>(value: T): T => {
    world.rngStreams[stream] = generator.state;
    return value;
  };
  return {
    next: () => save(generator.next()),
    int: (min, max) => save(generator.int(min, max)),
    range: (min, max) => save(generator.range(min, max)),
    chance: (p) => save(generator.chance(p)),
    pick: (items) => save(generator.pick(items)),
    get state() {
      return generator.state;
    },
  };
}
