/**
 * The world clock (SPEC §6). Driven by UTC wall-clock time, so every player
 * sees the same time of day: 1 real hour = ¼ game day, 4 real hours = 1 day.
 * This is the only place time of day comes from (CLAUDE.md rule 11).
 */

/** Real milliseconds in one game day (4 hours). */
export const DAY_MS = 4 * 60 * 60 * 1000;

/** Day fraction used while the prologue (and the "Always golden hour" lock) is active. ≈ 16:48. */
export const GOLDEN_HOUR_FRACTION = 0.7;
/** Day fraction for the "Always night" lock. ≈ 22:05. */
export const NIGHT_FRACTION = 0.92;

/** Player setting "Time of day". */
export type TimeOfDayLock = 'live' | 'golden' | 'night';

export const TIME_OF_DAY_LOCKS: readonly TimeOfDayLock[] = ['live', 'golden', 'night'];

export interface TimeSettings {
  /** Player's time-of-day lock. Default `'live'` (UTC). */
  lock: TimeOfDayLock;
  /** True until the prologue ends: time is frozen at golden hour. */
  prologue: boolean;
  /** Dev scrub slider / test `setTime()`: a fixed day fraction that beats everything else. */
  override?: number | null;
}

export type DayPhase = 'night' | 'dawn' | 'day' | 'golden' | 'dusk';

export interface WorldTime {
  /** 0 = midnight, 0.25 ≈ dawn, 0.5 = noon, 0.75 ≈ dusk. */
  dayFraction: number;
  /** Game-clock hour 0–23 and minute 0–59. */
  hours: number;
  minutes: number;
  phase: DayPhase;
  isNight: boolean;
  /** What decided the time: a dev/test override, the prologue, the player's lock, or the live clock. */
  source: 'override' | 'prologue' | 'lock' | 'live';
}

/** Live day fraction from wall-clock time: `(nowMs / 1000 % 14400) / 14400`. */
export function liveDayFraction(nowMs: number): number {
  return wrap01((nowMs % DAY_MS) / DAY_MS);
}

export function dayPhase(dayFraction: number): DayPhase {
  const f = wrap01(dayFraction);
  if (f < 0.2 || f >= 0.8) return 'night';
  if (f < 0.3) return 'dawn';
  if (f < 0.65) return 'day';
  if (f < 0.74) return 'golden';
  return 'dusk';
}

export function getWorldTime(nowMs: number, settings: TimeSettings): WorldTime {
  let dayFraction: number;
  let source: WorldTime['source'];
  if (settings.override !== undefined && settings.override !== null) {
    dayFraction = wrap01(settings.override);
    source = 'override';
  } else if (settings.prologue) {
    dayFraction = GOLDEN_HOUR_FRACTION;
    source = 'prologue';
  } else if (settings.lock === 'golden') {
    dayFraction = GOLDEN_HOUR_FRACTION;
    source = 'lock';
  } else if (settings.lock === 'night') {
    dayFraction = NIGHT_FRACTION;
    source = 'lock';
  } else {
    dayFraction = liveDayFraction(nowMs);
    source = 'live';
  }

  // The epsilon keeps exact fractions like 0.7 (16:48) from flooring to 16:47.
  const totalMinutes = Math.floor(dayFraction * 24 * 60 + 1e-9) % (24 * 60);
  const phase = dayPhase(dayFraction);
  return {
    dayFraction,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    phase,
    isNight: phase === 'night',
    source,
  };
}

/** "HH:MM" game-clock label. */
export function formatWorldTime(time: WorldTime): string {
  return `${String(time.hours).padStart(2, '0')}:${String(time.minutes).padStart(2, '0')}`;
}

function wrap01(value: number): number {
  return ((value % 1) + 1) % 1;
}
