import type { EntityId, Vec3, WorldState } from '../sim';

/**
 * Render interpolation (CLAUDE.md rule 7). The sim moves in 30 Hz steps; the
 * view draws each entity between its previous and current tick positions
 * using the loop's `alpha`, so motion looks smooth at any frame rate.
 * View-only: it copies positions out of the world and never writes back.
 */
export class Interpolator {
  private previous = new Map<EntityId, Vec3>();

  /** Call right before each sim tick to remember where entities were. */
  capture(world: WorldState): void {
    const next = new Map<EntityId, Vec3>();
    for (const entity of Object.values(world.entities)) {
      next.set(entity.id, { ...entity.position });
    }
    this.previous = next;
  }

  /** Writes the interpolated position of `id` into `out` (or the current one if it just spawned). */
  position(world: WorldState, id: EntityId, alpha: number, out: Vec3): Vec3 | undefined {
    const current = world.entities[id]?.position;
    if (!current) return undefined;
    return lerpVec3(this.previous.get(id) ?? current, current, alpha, out);
  }

  clear(): void {
    this.previous.clear();
  }
}

export function lerpVec3(a: Vec3, b: Vec3, t: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
}
