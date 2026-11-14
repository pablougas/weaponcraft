import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDINGS, InputMap } from './input-map';

describe('InputMap', () => {
  it('binds every action, and no key to two actions', () => {
    const seen = new Map<string, string>();
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
      expect(codes.length).toBeGreaterThan(0);
      for (const code of codes) {
        expect(seen.get(code), `${code} is bound to ${seen.get(code)} and ${action}`).toBeUndefined();
        seen.set(code, action);
      }
    }
  });

  it('never binds Ctrl, so Ctrl+W can\'t close the tab mid-fight', () => {
    expect([...new InputMap().allCodes()].some((code) => code.startsWith('Control'))).toBe(false);
  });

  it('looks up and rebinds', () => {
    const map = new InputMap({ jump: ['KeyJ'] });
    expect(map.matches('jump', { code: 'KeyJ' })).toBe(true);
    expect(map.matches('jump', { code: 'Space' })).toBe(false);
    expect(map.actionsFor('Mouse0')).toEqual(['punch']);
    expect(map.actionsFor('ArrowUp')).toEqual(['moveForward']);
    expect(map.actionsFor('KeyW')).toEqual([]);
    map.bind('godAbility', ['KeyR']);
    expect(map.codesFor('godAbility')).toEqual(['KeyR']);
  });
});
