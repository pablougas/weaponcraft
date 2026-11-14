import { describe, expect, it } from 'vitest';
import { beats, elementMultiplier, ELEMENTS, weakTo } from './elements';

describe('element wheel', () => {
  it('Light > Shadow > Poison > Lightning > Light', () => {
    expect(beats('light', 'shadow')).toBe(true);
    expect(beats('shadow', 'poison')).toBe(true);
    expect(beats('poison', 'lightning')).toBe(true);
    expect(beats('lightning', 'light')).toBe(true);
  });

  it('each element beats exactly one and is weak to exactly one, never itself', () => {
    for (const a of ELEMENTS) {
      expect(ELEMENTS.filter((b) => beats(a, b))).toHaveLength(1);
      expect(ELEMENTS.filter((b) => beats(b, a))).toHaveLength(1);
      expect(beats(a, a)).toBe(false);
      expect(beats(weakTo(a), a)).toBe(true);
    }
  });

  it('2× against the element you beat, otherwise 1×', () => {
    expect(elementMultiplier('lightning', 'light')).toBe(2);
    expect(elementMultiplier('light', 'lightning')).toBe(1);
    expect(elementMultiplier('poison', 'poison')).toBe(1);
    expect(elementMultiplier(null, 'light')).toBe(1);
    expect(elementMultiplier('light', undefined)).toBe(1);
  });
});
