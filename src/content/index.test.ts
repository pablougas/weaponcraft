import { describe, expect, it } from 'vitest';
import { playable, registries } from './index';

describe('content registries', () => {
  it('has the SPEC §12 registries', () => {
    expect(Object.keys(registries).sort()).toEqual(
      ['biomes', 'enemies', 'gods', 'mechs', 'spirits', 'structures', 'weapons'],
    );
  });

  it.each(Object.entries(registries))('%s has unique IDs', (_name, registry) => {
    const ids = registry.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('filters unapproved content out of normal play', () => {
    const defs = [{ id: 'a', approved: true }, { id: 'b', approved: false }];
    expect(playable(defs).map((def) => def.id)).toEqual(['a']);
  });
});
