import { describe, expect, it } from 'vitest';
import { GOLDEN_HOUR_FRACTION, NIGHT_FRACTION } from '../sim/time';
import { LIGHTING_KEYS, lightingSegment, TIME_OF_DAY_PRESETS } from './time-of-day';

describe('lighting keyframes', () => {
  it('cover the whole day in order and wrap night to night', () => {
    expect(LIGHTING_KEYS[0].at).toBe(0);
    expect(LIGHTING_KEYS.at(-1)!.at).toBe(1);
    for (let i = 1; i < LIGHTING_KEYS.length; i += 1) {
      expect(LIGHTING_KEYS[i].at).toBeGreaterThan(LIGHTING_KEYS[i - 1].at);
    }
    expect(LIGHTING_KEYS[0].sunCol).toBe(LIGHTING_KEYS.at(-1)!.sunCol);
  });

  it('lands exactly on the style-test keyframes at golden hour, dusk and night', () => {
    const golden = lightingSegment(TIME_OF_DAY_PRESETS.golden);
    expect(golden.f === 0 ? golden.a : golden.b).toMatchObject({ sunCol: '#ffcf8a', fogD: 0.00088, exp: 0.92 });
    const dusk = lightingSegment(TIME_OF_DAY_PRESETS.dusk);
    expect(dusk.f === 0 ? dusk.a : dusk.b).toMatchObject({ sunCol: '#ff8f5c', bloomS: 0.7 });
    const night = lightingSegment(NIGHT_FRACTION);
    expect(night.a.sunCol).toBe('#8fb0ff');
    expect(night.b.sunCol).toBe('#8fb0ff');
  });

  it('the sim golden hour and the view golden keyframe agree', () => {
    expect(TIME_OF_DAY_PRESETS.golden).toBe(GOLDEN_HOUR_FRACTION);
    expect(TIME_OF_DAY_PRESETS.night).toBe(NIGHT_FRACTION);
  });

  it('blends between neighbouring keys', () => {
    const mid = lightingSegment(0.6);
    expect(mid.a.at).toBe(TIME_OF_DAY_PRESETS.noon);
    expect(mid.b.at).toBe(TIME_OF_DAY_PRESETS.golden);
    expect(mid.f).toBeCloseTo(0.5);
    expect(lightingSegment(1.6).a.at).toBe(TIME_OF_DAY_PRESETS.noon);
  });

  it('the sun is up by day and the moon by night', () => {
    const noon = lightingSegment(0.5);
    expect((noon.f === 1 ? noon.b : noon.a).sun[1]).toBeGreaterThan(0.8);
    expect(lightingSegment(0.95).a.night).toBe(1);
  });
});
