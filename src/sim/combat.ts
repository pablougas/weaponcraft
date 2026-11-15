import { regionOf } from './regions';
import { TICK_HZ, ticks } from './constants';
import { elementMultiplier } from './elements';
import type { AttackKind, Element, Entity, EntityId, StatusEffect, StatusKind, Vec3, WorldState } from './types';
import { isKnownWeapon, weaponData } from './weapons';
import type { SimContext } from './world';

/** Health regeneration waits this long after a hit (systems/hero.ts HEALTH_REGEN_DELAY). */
const HEALTH_REGEN_DELAY_TICKS = ticks(4);

/** Three-Fold Howl's lifesteal share (content/spirits/cerberus.ts HOWL.lifesteal). */
const HOWL_LIFESTEAL = 0.3;

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
    if (target.id === attacker.id || !isHittable(target) || (attacker.hero && target.hero)) continue;
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
    // Gods never hit each other (Zeus and Hades fight side by side).
    .filter((e) => !exclude.has(e.id) && isHittable(e) && !e.hero && flatDistance(e.position, point) <= range && Math.abs(e.position.y - point.y) < 6)
    .map((e) => ({ id: e.id, distance: flatDistance(e.position, point) }))
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
    .map((t) => t.id);
}

/**
 * Knocks a creature away from `from` at `speed` m/s for `ticks`, and stuns it
 * (it can't walk) for `stunTicks`. Practice dummies don't budge but still flinch.
 */
export function knockBack(ctx: SimContext, targetId: EntityId, from: Vec3, speed: number, knockTicks: number, stunTicks: number): void {
  if (!ctx.isAuthority) return;
  const creature = ctx.world.entities[targetId]?.creature;
  if (!creature) return;
  creature.stun = Math.max(creature.stun ?? 0, stunTicks);
  if (!creature.wanders) return;
  const target = ctx.world.entities[targetId];
  const dx = target.position.x - from.x;
  const dz = target.position.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  creature.knock = { x: (dx / length) * speed, z: (dz / length) * speed, ticks: knockTicks };
}

/** Damage kinds: weapon/fist attacks, abilities, and lingering status damage. */
export type DamageKind = AttackKind | 'ability' | 'status';

/** A weapon whose element matches an ability's boosts that ability's damage (SPEC §8). */
export const ABILITY_BOOST = 1.25;
/** Status effects per element (SPEC §7). */
const BLIND_TICKS = ticks(3);
const POISON_TICKS = ticks(4);
const POISON_DPS = 3;
const STUN_TICKS = ticks(0.4);
/** Shadow heals the attacker by this fraction of the damage dealt. */
const LIFESTEAL = 0.25;

export function hasStatus(entity: Entity | undefined, kind: StatusKind): boolean {
  return !!entity?.statuses?.some((s) => s.kind === kind && s.ticksLeft > 0);
}

export function addStatus(target: Entity, status: StatusEffect): void {
  target.statuses ??= [];
  const existing = target.statuses.find((s) => s.kind === status.kind);
  if (existing) {
    existing.ticksLeft = Math.max(existing.ticksLeft, status.ticksLeft);
    existing.power = Math.max(existing.power, status.power);
    existing.sourceId = status.sourceId;
  } else {
    target.statuses.push(status);
  }
}

/**
 * The single damage pipeline (SPEC §8): base → element wheel → status →
 * ability boosts. Every hit in the game goes through here. Returns damage dealt.
 *
 * - Element wheel: 2× when the attack's element beats the target's.
 * - Ability boost: ×1.25 for an ability whose element matches the attacker's weapon.
 * - Status by element: Light blinds, Shadow steals life, Poison poisons, Lightning stuns.
 */
export function applyDamage(
  ctx: SimContext,
  targetId: EntityId,
  amount: number,
  attackerId: EntityId | null,
  kind: DamageKind,
  element: Element | null = null,
): number {
  if (!ctx.isAuthority) return 0;
  const { world } = ctx;
  const target = world.entities[targetId];
  if (!isHittable(target)) return 0;
  if (target.hero && target.hero.iframes > 0) {
    ctx.emit('combat:evaded', { attackerId, targetId });
    return 0;
  }
  const attacker = attackerId ? world.entities[attackerId] : undefined;

  // Base → element wheel → ability boost.
  const multiplier = elementMultiplier(element, target.element);
  let boost = 1;
  if (kind === 'ability' && element && attacker?.hero && isKnownWeapon(world, attacker.hero.weaponId)
    && weaponData(world, attacker.hero.weaponId).element === element) {
    boost = ABILITY_BOOST;
  }
  // Hades's passive and Shadow Step's ambush.
  const passive = attacker?.hero?.passiveDamage;
  if (passive && regionOf(attacker) === 'underworld') boost *= passive;
  if (attacker?.hero?.ambush && attacker.hero.ambush.ticks > 0 && kind !== 'status') {
    boost *= attacker.hero.ambush.multiplier;
    attacker.hero.ambush = null;
  }
  // Shield-bearers block most of what hits them from the front (go round, or break the guard with a stun).
  if (target.soldier?.kind === 'shield' && attacker && kind !== 'status' && !(target.creature?.stun)) {
    const toAttacker = Math.atan2(attacker.position.x - target.position.x, attacker.position.z - target.position.z);
    const off = Math.abs(Math.atan2(Math.sin(toAttacker - target.soldier.facing), Math.cos(toAttacker - target.soldier.facing)));
    if (off < 0.9) {
      boost *= 0.3;
      ctx.emit('combat:blocked', { attackerId, targetId });
    }
  }
  // Sentry captains' heavy armour: light strikes and punches only do half (use heavy attacks and abilities).
  if (target.soldier?.kind === 'captain' && (kind === 'light' || kind === 'punch')) {
    boost *= 0.5;
    ctx.emit('combat:blocked', { attackerId, targetId });
  }
  const dealt = Math.min(target.health.current, Math.max(0, Math.round(amount * multiplier * boost)));
  target.health.current -= dealt;

  if (target.hero && kind !== 'status') target.hero.hurtTicks = HURT_TICKS;
  // Any damage (poison too) pauses health regeneration (systems/hero.ts).
  if (target.hero && dealt > 0) target.hero.regenDelay = HEALTH_REGEN_DELAY_TICKS;
  if (target.creature && kind !== 'status') {
    target.creature.sinceHit = 0;
    if (target.creature.wanders && !hasStatus(target, 'blind')) {
      target.creature.flee = FLEE_TICKS;
      target.creature.target = null;
    }
  }

  // Status effects (not from status damage itself, so poison doesn't re-poison).
  if (element && kind !== 'status' && dealt > 0) {
    if (element === 'light') addStatus(target, { kind: 'blind', ticksLeft: BLIND_TICKS, power: 0, sourceId: attackerId });
    if (element === 'poison') addStatus(target, { kind: 'poison', ticksLeft: POISON_TICKS, power: POISON_DPS, sourceId: attackerId });
    if (element === 'lightning') {
      addStatus(target, { kind: 'stun', ticksLeft: STUN_TICKS, power: 0, sourceId: attackerId });
      if (target.creature) target.creature.stun = Math.max(target.creature.stun ?? 0, STUN_TICKS);
    }
    if (element === 'shadow' && attacker?.health) {
      attacker.health.current = Math.min(attacker.health.max, attacker.health.current + Math.round(dealt * LIFESTEAL));
    }
  }

  // Three-Fold Howl: the god heals a share of everything it deals while the howl lasts.
  if (attacker?.hero?.howl && attacker.health && dealt > 0 && kind !== 'status') {
    attacker.health.current = Math.min(attacker.health.max, attacker.health.current + Math.round(dealt * HOWL_LIFESTEAL));
  }
  ctx.emit('combat:hit', { attackerId, targetId, amount: dealt, kind, remaining: target.health.current, element, multiplier: multiplier * boost });
  if (target.health.current <= 0) {
    ctx.emit('entity:defeated', { entityId: targetId, defId: target.defId, by: attackerId });
  }
  return dealt;
}

/** Ticks down status effects and applies poison damage once a second. */
export function updateStatuses(ctx: SimContext): void {
  for (const entity of Object.values(ctx.world.entities)) {
    if (!entity.statuses?.length) continue;
    for (const status of entity.statuses) {
      status.ticksLeft -= 1;
      if ((status.kind === 'poison' || status.kind === 'crush') && status.ticksLeft % TICK_HZ === 0 && status.ticksLeft >= 0) {
        applyDamage(ctx, entity.id, status.power, status.sourceId, 'status');
      }
    }
    entity.statuses = entity.statuses.filter((s) => s.ticksLeft > 0);
  }
}
