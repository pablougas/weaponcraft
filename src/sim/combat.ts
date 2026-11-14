import { ticks } from './constants';
import type { AttackKind, Entity, EntityId, Vec3, WorldState } from './types';
import type { SimContext } from './world';

/** Ticks a hurt reaction (face, flinch) lasts. */
const HURT_TICKS = ticks(0.4);
/** Ticks wildlife runs away after being hit. */
const FLEE_TICKS = ticks(2.5);

/** Can this entity be hit right now? */
export function isHittable(entity: Entity | undefined): entity is Entity & { health: NonNullable<Entity['health']> } {
  return !!entity && !!entity.health && entity.health.current > 0;
}

/** Horizontal distance between two points. */
export function flatDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Point at roughly chest height on an entity (where effects and hits aim). */
export function chestPoint(entity: Entity): Vec3 {
  const height = entity.body?.height ?? 1.6;
  return { x: entity.position.x, y: entity.position.y + height * 0.6, z: entity.position.z };
}

/**
 * Hittable entities (other than `attacker`) within `range` metres and inside a
 * `arcDeg` arc in front of it, nearest first. Range is measured to the edge of
 * the target's body.
 */
export function targetsInArc(world: WorldState, attacker: Entity, range: number, arcDeg: number): EntityId[] {
  const fx = Math.sin(attacker.rotationY);
  const fz = Math.cos(attacker.rotationY);
  const halfArc = ((arcDeg / 2) * Math.PI) / 180;
  const found: Array<{ id: EntityId; distance: number }> = [];
  for (const target of Object.values(world.entities)) {
    if (target.id === attacker.id || !isHittable(target)) continue;
    const dx = target.position.x - attacker.position.x;
    const dz = target.position.z - attacker.position.z;
    const centre = Math.hypot(dx, dz);
    const distance = centre - (target.body?.radius ?? 0.4);
    if (distance > range) continue;
    if (Math.abs(target.position.y - attacker.position.y) > 2.5) continue;
    if (centre > 0.01) {
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / centre)));
      if (angle > halfArc) continue;
    }
    found.push({ id: target.id, distance });
  }
  return found.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id)).map((t) => t.id);
}

/** Hittable entities within `range` of a point, nearest first. */
export function targetsNear(world: WorldState, point: Vec3, range: number, exclude: ReadonlySet<EntityId>): EntityId[] {
  return Object.values(world.entities)
    .filter((e) => !exclude.has(e.id) && isHittable(e) && flatDistance(e.position, point) <= range && Math.abs(e.position.y - point.y) < 6)
    .map((e) => ({ id: e.id, distance: flatDistance(e.position, point) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .map((t) => t.id);
}

/**
 * The single damage entry point. M4 extends it into the full pipeline
 * (base → element wheel → status → ability boosts). Returns damage dealt.
 */
export function applyDamage(ctx: SimContext, targetId: EntityId, amount: number, attackerId: EntityId | null, kind: AttackKind | 'ability'): number {
  if (!ctx.isAuthority) return 0;
  const target = ctx.world.entities[targetId];
  if (!isHittable(target)) return 0;
  if (target.hero && target.hero.iframes > 0) {
    ctx.emit('combat:evaded', { attackerId, targetId });
    return 0;
  }
  const dealt = Math.min(target.health.current, Math.max(0, Math.round(amount)));
  target.health.current -= dealt;
  if (target.hero) target.hero.hurtTicks = HURT_TICKS;
  if (target.creature) {
    target.creature.sinceHit = 0;
    if (target.creature.wanders) {
      target.creature.flee = FLEE_TICKS;
      target.creature.target = null;
    }
  }
  ctx.emit('combat:hit', { attackerId, targetId, amount: dealt, kind, remaining: target.health.current });
  if (target.health.current <= 0) {
    ctx.emit('entity:defeated', { entityId: targetId, defId: target.defId, by: attackerId });
  }
  return dealt;
}
