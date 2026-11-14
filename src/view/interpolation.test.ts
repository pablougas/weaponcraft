import { describe, expect, it } from 'vitest';
import { createSimContext, createWorld, spawn } from '../sim';
import { Interpolator, lerpVec3 } from './interpolation';

describe('Interpolator', () => {
  it('draws entities between their previous and current tick positions', () => {
    const world = createWorld(1, 0);
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'sheep', { position: { x: 0, y: 0, z: 0 } });
    const interpolator = new Interpolator();
    interpolator.capture(world);
    world.entities[id].position.x = 10;
    const out = { x: 0, y: 0, z: 0 };
    expect(interpolator.position(world, id, 0, out)).toEqual({ x: 0, y: 0, z: 0 });
    expect(interpolator.position(world, id, 0.25, out)?.x).toBe(2.5);
    expect(interpolator.position(world, id, 1, out)?.x).toBe(10);
  });

  it('uses the current position for new entities and nothing for removed ones', () => {
    const world = createWorld(1, 0);
    const interpolator = new Interpolator();
    interpolator.capture(world);
    const { ctx } = createSimContext(world, true);
    const id = spawn(ctx, 'sheep', { position: { x: 4, y: 0, z: 0 } });
    expect(interpolator.position(world, id, 0.5, { x: 0, y: 0, z: 0 })?.x).toBe(4);
    expect(interpolator.position(world, 'e99', 0.5, { x: 0, y: 0, z: 0 })).toBeUndefined();
  });

  it('lerpVec3', () => {
    expect(lerpVec3({ x: 0, y: 2, z: -2 }, { x: 2, y: 4, z: 2 }, 0.5)).toEqual({ x: 1, y: 3, z: 0 });
  });
});
