import { isHittable } from '../../../sim/combat';
import { groundHeightAt } from '../../../sim/terrain/meadow-rocks';
import type { Entity, Vec3 } from '../../../sim/types';
import type { SimContext } from '../../../sim/world';

/** The direction a hero is aiming: the camera heading if known, else where it faces. */
export function aimYaw(entity: Entity): number {
  return entity.hero?.aimYaw ?? entity.rotationY;
}

/** A point on the ground `distance` metres ahead along the hero's aim. */
export function aimPoint(entity: Entity, distance: number): Vec3 {
  const yaw = aimYaw(entity);
  const x = entity.position.x + Math.sin(yaw) * distance;
  const z = entity.position.z + Math.cos(yaw) * distance;
  return { x, y: groundHeightAt(x, z), z };
}

/** The hero's lock-on target, if it's still hittable. */
export function lockedTarget(ctx: SimContext, entity: Entity): Entity | undefined {
  const id = entity.hero?.lockTarget;
  const target = id ? ctx.world.entities[id] : undefined;
  return isHittable(target) ? target : undefined;
}
