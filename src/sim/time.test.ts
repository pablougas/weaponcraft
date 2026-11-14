import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  dayPhase,
  formatWorldTime,
  getWorldTime,
  GOLDEN_HOUR_FRACTION,
  liveDayFraction,
  NIGHT_FRACTION,
  type TimeSettings,
} from './time';

const live: TimeSettings = { lock: 'live', prologue: false };
const HOUR = 60 * 60 * 1000;

describe('getWorldTime', () => {
  it('a game day lasts 4 real hours and follows the spec formula', () => {
    expect(DAY_MS).toBe(4 * HOUR);
    for (const now of [0, 1_234_567, 1_763_100_000_000, Date.UTC(2026, 10, 15, 13, 7)]) {
      expect(liveDayFraction(now)).toBeCloseTo((now / 1000 % 14400) / 14400, 10);
    }
  });

  it('uses UTC wall-clock time: midnight, dawn, noon, dusk', () => {
    const midnight = Date.UTC(2026, 10, 15, 0, 0); // divisible by 4 h
    expect(getWorldTime(midnight, live).dayFraction).toBe(0);
    expect(getWorldTime(midnight + 1 * HOUR, live)).toMatchObject({ dayFraction: 0.25, hours: 6, phase: 'dawn' });
    expect(getWorldTime(midnight + 2 * HOUR, live)).toMatchObject({ dayFraction: 0.5, hours: 12, phase: 'day' });
    expect(getWorldTime(midnight + 3 * HOUR, live)).toMatchObject({ dayFraction: 0.75, hours: 18, phase: 'dusk' });
    expect(getWorldTime(midnight + 4 * HOUR, live).dayFraction).toBe(0);
    expect(getWorldTime(midnight + 2 * HOUR, live).source).toBe('live');
  });

  it('1 real hour advances the clock by a quarter day', () => {
    const now = 1_763_000_123_456;
    const delta = getWorldTime(now + HOUR, live).dayFraction - getWorldTime(now, live).dayFraction;
    expect(((delta % 1) + 1) % 1).toBeCloseTo(0.25, 10);
  });

  it('the prologue freezes time at golden hour, whatever the clock or lock', () => {
    for (const now of [0, 5 * HOUR, 1_763_000_000_000]) {
      for (const lock of ['live', 'night'] as const) {
        const time = getWorldTime(now, { lock, prologue: true });
        expect(time).toMatchObject({ dayFraction: GOLDEN_HOUR_FRACTION, phase: 'golden', source: 'prologue' });
      }
    }
  });

  it('honours the time-of-day lock after the prologue', () => {
    expect(getWorldTime(0, { lock: 'golden', prologue: false })).toMatchObject({
      dayFraction: GOLDEN_HOUR_FRACTION, phase: 'golden', source: 'lock',
    });
    expect(getWorldTime(0, { lock: 'night', prologue: false })).toMatchObject({
      dayFraction: NIGHT_FRACTION, isNight: true, source: 'lock',
    });
  });

  it('a dev/test override beats the prologue and the lock', () => {
    expect(getWorldTime(0, { lock: 'night', prologue: true, override: 0.5 })).toMatchObject({
      dayFraction: 0.5, source: 'override',
    });
    expect(getWorldTime(0, { ...live, override: 1.25 }).dayFraction).toBe(0.25);
    expect(getWorldTime(0, { ...live, override: null }).source).toBe('live');
  });

  it('labels phases and formats the clock', () => {
    expect(['night', 'dawn', 'day', 'golden', 'dusk'].map((p) => p)).toContain(dayPhase(0.7));
    expect(dayPhase(0.1)).toBe('night');
    expect(dayPhase(0.95)).toBe('night');
    expect(dayPhase(0.7)).toBe('golden');
    expect(formatWorldTime(getWorldTime(0, { ...live, override: 0.7 }))).toBe('16:48');
  });
});
