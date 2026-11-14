import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../sim/tick';
import { FixedStepLoop } from './loop';

describe('FixedStepLoop', () => {
  it('runs 30 ticks per simulated second regardless of frame rate', () => {
    for (const fps of [24, 60, 144]) {
      const loop = new FixedStepLoop();
      let ticks = 0;
      for (let frame = 0; frame < fps; frame += 1) loop.advance(1000 / fps, 0, () => { ticks += 1; });
      expect(Math.abs(ticks - 30)).toBeLessThanOrEqual(1);
    }
  });

  it('returns the interpolation alpha between ticks', () => {
    const loop = new FixedStepLoop();
    expect(loop.advance(TICK_MS / 2, 0, () => undefined)).toBeCloseTo(0.5);
    expect(loop.advance(TICK_MS / 4, 0, () => undefined)).toBeCloseTo(0.75);
  });

  it('caps catch-up after a long pause', () => {
    const loop = new FixedStepLoop(5);
    let ticks = 0;
    const alpha = loop.advance(10_000, 0, () => { ticks += 1; });
    expect(ticks).toBe(5);
    expect(alpha).toBeLessThan(1);
    loop.advance(0, 0, () => { ticks += 1; });
    expect(ticks).toBe(5);
  });

  it('measures the tick rate over the last second', () => {
    const loop = new FixedStepLoop();
    for (let i = 0; i < 30; i += 1) loop.recordTick(i * TICK_MS);
    expect(loop.measuredTickRate(999)).toBe(30);
    expect(loop.measuredTickRate(2000)).toBe(0);
  });
});
