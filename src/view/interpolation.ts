import type { EntityId, Vec3, WorldState } from '../sim';

/**
 * Render interpolation (CLAUDE.md rule 7). The sim moves in 30 Hz steps; the
 * view draws each entity between its previous and current tick positions
 * using the loop's `alpha`, so motion looks smooth at any frame rate.
 * View-only: it copies positions out of the world and never writes back.
 */
export class Interpolator {
  private previous = new Map<EntityId, Vec3>();
  private previousRotation = new Map<EntityId, number>();

  /** Call right before each sim tick to remember where entities were. */
  capture(world: WorldState): void {
    const next = new Map<EntityId, Vec3>();
    const nextRotation = new Map<EntityId, number>();
    for (const entity of Object.values(world.entities)) {
      next.set(entity.id, { ...entity.position });
      nextRotation.set(entity.id, entity.rotationY);
    }
    this.previous = next;
    this.previousRotation = nextRotation;
  }

  /** Writes the interpolated position of `id` into `out` (or the current one if it just spawned). */
  position(world: WorldState, id: EntityId, alpha: number, out: Vec3): Vec3 | undefined {
    const current = world.entities[id]?.position;
    if (!current) return undefined;
    return lerpVec3(this.previous.get(id) ?? current, current, alpha, out);
  }

  /** Interpolated heading of `id`, turning the short way round. */
  rotation(world: WorldState, id: EntityId, alpha: number): number | undefined {
    const current = world.entities[id]?.rotationY;
    if (current === undefined) return undefined;
    const previous = this.previousRotation.get(id) ?? current;
    const delta = Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
    return previous + delta * alpha;
  }

  clear(): void {
    this.previous.clear();
    this.previousRotation.clear();
  }
}

export function lerpVec3(a: Vec3, b: Vec3, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}
