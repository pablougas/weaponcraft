/** The sim runs at a fixed 30 Hz (CLAUDE.md rule 7). */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
/** Seconds per sim tick. */
export const DT = 1 / TICK_HZ;
/** Gravity in m/s². A little stronger than Earth's so jumps feel snappy. */
export const GRAVITY = 24;
/** Players and wildlife stay within this distance of the hero rock (the meadow's edge). */
export const MEADOW_RADIUS = 140;
/** Converts a per-second rate to per-tick. */
export const perTick = (perSecond: number): number => perSecond * DT;
/** Converts seconds to whole ticks. */
export const ticks = (seconds: number): number => Math.round(seconds * TICK_HZ);
