import { describe, expect, it } from 'vitest';
import type { SaveStorage } from './save';
import { defaultSettings, parseSettings, pickAutoQuality, SETTINGS_KEY, SettingsStore } from './settings';

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('settings', () => {
  it('defaults: auto quality, every effect on, live time', () => {
    expect(defaultSettings()).toEqual({
      quality: 'auto',
      effects: { bloom: true, godRays: true, outlines: true, colorGrade: true, particles: true },
      reduceMotion: false,
      timeOfDay: 'live',
      mouseSensitivity: 1,
      invertY: false,
      cameraAutoFollow: true,
    });
    expect(defaultSettings(true).reduceMotion).toBe(true);
  });

  it('ignores malformed or unknown stored values', () => {
    const d = defaultSettings();
    expect(parseSettings('not json', d)).toEqual(d);
    expect(parseSettings(JSON.stringify({ quality: 'ultra', timeOfDay: 'noon', effects: { bloom: 'no', godRays: false } }), d))
      .toEqual({ ...d, effects: { ...d.effects, godRays: false } });
  });

  it('saves under a namespaced key and restores', () => {
    const storage = memoryStorage();
    const store = new SettingsStore(storage);
    const seen: boolean[] = [];
    store.subscribe((s) => seen.push(s.effects.bloom));
    store.update((s) => { s.effects.bloom = false; s.timeOfDay = 'golden'; });
    expect(seen).toEqual([true, false]);
    expect(SETTINGS_KEY.startsWith('weaponcraft:')).toBe(true);
    expect(new SettingsStore(storage).get()).toMatchObject({ timeOfDay: 'golden', effects: { bloom: false } });
  });

  it('clamps mouse sensitivity', () => {
    expect(parseSettings(JSON.stringify({ mouseSensitivity: 99, invertY: true }), defaultSettings())).toMatchObject({ mouseSensitivity: 3, invertY: true });
  });

  it('get() returns a copy', () => {
    const store = new SettingsStore(undefined);
    store.get().effects.bloom = false;
    expect(store.get().effects.bloom).toBe(true);
  });

  it('auto quality follows the measured frame rate', () => {
    expect(pickAutoQuality(25)).toBe('low');
    expect(pickAutoQuality(50)).toBe('medium');
    expect(pickAutoQuality(60)).toBe('high');
  });
});
