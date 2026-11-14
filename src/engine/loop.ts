import { TICK_MS } from '../sim/tick';

/**
 * Fixed-timestep driver: runs the sim at exactly 30 Hz regardless of frame
 * rate and tells the renderer how far it is between two ticks (`alpha`) so it
 * can interpolate.
 */
export class FixedStepLoop {
  /** Real milliseconds not yet consumed by a tick. */
  private accumulator = 0;
  private readonly tickTimes: number[] = [];

  /**
   * @param maxStepsPerFrame Caps catch-up after a long pause (e.g. a background
   *   tab) so the sim never spirals; the extra time is dropped.
   */
  constructor(private readonly maxStepsPerFrame = 5, private readonly tickMs = TICK_MS) {}

  /**
   * Adds `frameMs` of real time, calls `step` once per whole tick that fits,
   * and returns the interpolation factor in [0, 1).
   */
  advance(frameMs: number, nowMs: number, step: () => void): number {
    this.accumulator += Math.max(0, frameMs);
    let steps = 0;
    while (this.accumulator >= this.tickMs && steps < this.maxStepsPerFrame) {
      step();
      this.recordTick(nowMs);
      this.accumulator -= this.tickMs;
      steps += 1;
    }
    if (steps === this.maxStepsPerFrame && this.accumulator >= this.tickMs) {
      this.accumulator %= this.tickMs;
    }
    return this.accumulator / this.tickMs;
  }

  /** Records a tick that ran outside `advance()` (e.g. the test API's `step()`). */
  recordTick(nowMs: number): void {
    this.tickTimes.push(nowMs);
  }

  /** Ticks run in the last real second (for the dev menu). */
  measuredTickRate(nowMs: number): number {
    while (this.tickTimes.length > 0 && this.tickTimes[0] <= nowMs - 1000) this.tickTimes.shift();
    return this.tickTimes.length;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
