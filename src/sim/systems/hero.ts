import { applyDamage, isHittable, targetsInArc } from '../combat';
import { DT, GRAVITY, MEADOW_RADIUS, perTick, ticks } from '../constants';
import { godDef, weaponDef } from '../defs';
import type { Intent } from '../intents';
import type { PhysicsWorld } from '../physics';
import { WATER_LEVEL } from '../terrain/meadow';
import { groundHeightAt } from '../terrain/meadow-rocks';
import type { Entity, EntityId, HeroState } from '../types';
import type { SimContext } from '../world';

const DODGE_TICKS = ticks(0.33);
const DODGE_IFRAMES = ticks(0.24);
const DODGE_SPEED = 11;
const DODGE_STAMINA = 20;
const SPRINT_DRAIN_PER_SEC = 18;
const HOVER_DRAIN_PER_SEC = 10;
const STAMINA_REGEN_PER_SEC = 28;
/** Pause before stamina refills after spending it. */
const STAMINA_DELAY = ticks(0.5);
/** Slowest fall while hovering, m/s. */
const HOVER_FALL_SPEED = 1.1;
/** Turning speed toward the move direction, radians/s. */
const TURN_SPEED = 14;
const LOCK_RANGE = 20;
/** Lock-on breaks beyond this distance. */
const LOCK_BREAK_RANGE = 26;

export function newHeroState(weaponId: string): HeroState {
  return {
    move: { x: 0, z: 0 },
    sprint: false,
    jumpHeld: false,
    vy: 0,
    grounded: true,
    hoverLeft: 0,
    dodge: null,
    iframes: 0,
    attack: null,
    cooldowns: {},
    lockTarget: null,
    weaponId,
    staminaDelay: 0,
    hurtTicks: 0,
    moving: false,
    sprinting: false,
  };
}

/** The hero entity a player controls, if spawned. */
export function playerHero(ctx: SimContext, playerId: string): (Entity & { hero: HeroState }) | undefined {
  const entityId = ctx.world.players[playerId]?.entityId;
  const entity = entityId ? ctx.world.entities[entityId] : undefined;
  return entity?.hero ? (entity as Entity & { hero: HeroState }) : undefined;
}

function spendStamina(entity: Entity, amount: number): boolean {
  if (!entity.stamina || entity.stamina.current < amount) return false;
  entity.stamina.current -= amount;
  if (entity.hero) entity.hero.staminaDelay = STAMINA_DELAY;
  return true;
}

function faceTowards(entity: Entity, x: number, z: number): void {
  entity.rotationY = Math.atan2(x - entity.position.x, z - entity.position.z);
}

/** Applies a player's move/action intent to their hero. Returns a rejection reason, or null. */
export function applyHeroIntent(ctx: SimContext, intent: Extract<Intent, { type: 'player:move' | 'player:action' }>): string | null {
  const entity = playerHero(ctx, intent.playerId);
  if (!entity) return 'no hero';
  const hero = entity.hero;

  if (intent.type === 'player:move') {
    const length = Math.hypot(intent.x, intent.z);
    const scale = length > 1 ? 1 / length : 1;
    hero.move = { x: (Number.isFinite(intent.x) ? intent.x : 0) * scale, z: (Number.isFinite(intent.z) ? intent.z : 0) * scale };
    hero.sprint = !!intent.sprint;
    hero.jumpHeld = !!intent.jumpHeld;
    return null;
  }
  if (!ctx.isAuthority) return null;
  const god = godDef(entity.defId);

  switch (intent.action) {
    case 'jump':
      if (!hero.grounded || hero.dodge) return 'not grounded';
      hero.vy = god.jumpSpeed;
      hero.grounded = false;
      hero.hoverLeft = god.hoverTicks;
      ctx.emit('hero:jump', { entityId: entity.id });
      return null;
    case 'dodge': {
      if (hero.dodge || !hero.grounded) return 'busy';
      if (!spendStamina(entity, DODGE_STAMINA)) return 'no stamina';
      const length = Math.hypot(hero.move.x, hero.move.z);
      const dir = length > 0.1
        ? { x: hero.move.x / length, z: hero.move.z / length }
        : { x: Math.sin(entity.rotationY), z: Math.cos(entity.rotationY) };
      hero.dodge = { ticksLeft: DODGE_TICKS, dir };
      hero.iframes = DODGE_IFRAMES;
      hero.attack = null;
      entity.rotationY = Math.atan2(dir.x, dir.z);
      ctx.emit('hero:dodge', { entityId: entity.id });
      return null;
    }
    case 'lightAttack':
    case 'heavyAttack': {
      if (hero.attack || hero.dodge) return 'busy';
      const kind = intent.action === 'lightAttack' ? 'light' : 'heavy';
      const spec = weaponDef(hero.weaponId)[kind];
      if (!spendStamina(entity, spec.staminaCost)) return 'no stamina';
      hero.attack = { kind, tick: 0, hit: false };
      const target = hero.lockTarget ? ctx.world.entities[hero.lockTarget] : undefined;
      if (target) faceTowards(entity, target.position.x, target.position.z);
      ctx.emit('hero:attack', { entityId: entity.id, kind });
      return null;
    }
    case 'godAbility': {
      const ability = god.ability;
      if ((hero.cooldowns[ability.id] ?? 0) > 0) return 'cooling down';
      if (!entity.stamina || entity.stamina.current < ability.staminaCost) return 'no stamina';
      if (!ability.cast(ctx, entity.id)) return 'no effect';
      spendStamina(entity, ability.staminaCost);
      hero.cooldowns[ability.id] = ability.cooldownTicks;
      return null;
    }
    case 'lockOn':
      hero.lockTarget = hero.lockTarget ? null : findLockTarget(ctx, entity);
      return null;
    default:
      return 'unknown action';
  }
}

/** Nearest hittable entity within range, preferring ones in front of the hero. */
function findLockTarget(ctx: SimContext, entity: Entity): EntityId | null {
  const fx = Math.sin(entity.rotationY);
  const fz = Math.cos(entity.rotationY);
  let best: { id: EntityId; score: number } | null = null;
  for (const other of Object.values(ctx.world.entities)) {
    if (other.id === entity.id || !isHittable(other)) continue;
    const dx = other.position.x - entity.position.x;
    const dz = other.position.z - entity.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > LOCK_RANGE || distance < 0.01) continue;
    const facing = (dx * fx + dz * fz) / distance; // 1 = straight ahead
    const score = distance * (1.6 - facing * 0.6);
    if (!best || score < best.score || (score === best.score && other.id < best.id)) best = { id: other.id, score };
  }
  return best?.id ?? null;
}

/** Advances every hero by one tick: timers, stamina, attacks, movement and physics. */
export function updateHeroes(ctx: SimContext, physics: PhysicsWorld | undefined): void {
  for (const entity of Object.values(ctx.world.entities)) {
    if (entity.hero) updateHero(ctx, entity as Entity & { hero: HeroState }, physics);
  }
}

function updateHero(ctx: SimContext, entity: Entity & { hero: HeroState }, physics: PhysicsWorld | undefined): void {
  const { world } = ctx;
  const hero = entity.hero;
  const god = godDef(entity.defId);

  hero.iframes = Math.max(0, hero.iframes - 1);
  hero.hurtTicks = Math.max(0, hero.hurtTicks - 1);
  hero.staminaDelay = Math.max(0, hero.staminaDelay - 1);
  for (const id of Object.keys(hero.cooldowns)) {
    hero.cooldowns[id] = Math.max(0, hero.cooldowns[id] - 1);
    if (hero.cooldowns[id] === 0) delete hero.cooldowns[id];
  }
  if (god.ability.update) god.ability.update(ctx, entity.id);

  if (hero.lockTarget) {
    const target = world.entities[hero.lockTarget];
    if (!isHittable(target) || Math.hypot(target.position.x - entity.position.x, target.position.z - entity.position.z) > LOCK_BREAK_RANGE) {
      hero.lockTarget = null;
    }
  }

  // Horizontal velocity from the current state.
  const moveLength = Math.hypot(hero.move.x, hero.move.z);
  let vx = 0;
  let vz = 0;
  let sprinting = false;
  if (hero.dodge) {
    vx = hero.dodge.dir.x * DODGE_SPEED;
    vz = hero.dodge.dir.z * DODGE_SPEED;
    hero.dodge.ticksLeft -= 1;
    if (hero.dodge.ticksLeft <= 0) hero.dodge = null;
  } else if (hero.attack) {
    const spec = weaponDef(hero.weaponId)[hero.attack.kind];
    hero.attack.tick += 1;
    if (hero.attack.tick < spec.hitTick) {
      vx = Math.sin(entity.rotationY) * spec.lunge;
      vz = Math.cos(entity.rotationY) * spec.lunge;
    }
    if (!hero.attack.hit && hero.attack.tick >= spec.hitTick) {
      hero.attack.hit = true;
      const targets = targetsInArc(world, entity, spec.range, spec.arcDeg);
      for (const id of spec.cleave ? targets : targets.slice(0, 1)) {
        applyDamage(ctx, id, spec.damage, entity.id, hero.attack.kind);
      }
    }
    if (hero.attack.tick >= spec.totalTicks) hero.attack = null;
  } else if (moveLength > 0.05) {
    sprinting = hero.sprint && !!entity.stamina && entity.stamina.current > 0;
    const speed = sprinting ? god.sprintSpeed : god.walkSpeed;
    vx = hero.move.x * speed;
    vz = hero.move.z * speed;
    // Turn smoothly toward the move direction (or the lock-on target).
    const lock = hero.lockTarget ? world.entities[hero.lockTarget] : undefined;
    const desired = lock
      ? Math.atan2(lock.position.x - entity.position.x, lock.position.z - entity.position.z)
      : Math.atan2(hero.move.x, hero.move.z);
    let delta = desired - entity.rotationY;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const maxTurn = TURN_SPEED * DT;
    entity.rotationY += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }
  entity.rotationY = Math.atan2(Math.sin(entity.rotationY), Math.cos(entity.rotationY));

  // Stamina: sprinting and hovering drain it; it refills after a short pause.
  if (entity.stamina) {
    if (sprinting) {
      entity.stamina.current = Math.max(0, entity.stamina.current - perTick(SPRINT_DRAIN_PER_SEC));
      hero.staminaDelay = STAMINA_DELAY;
    } else if (hero.staminaDelay === 0) {
      entity.stamina.current = Math.min(entity.stamina.max, entity.stamina.current + perTick(STAMINA_REGEN_PER_SEC));
    }
  }

  // Vertical: gravity, with a short hover while jump is held on the way down.
  if (hero.grounded && hero.vy <= 0) {
    // Press onto slopes while walking. Standing still, only probe for the
    // ground: a full push sinks the capsule into convex colliders and wedges it.
    hero.vy = Math.hypot(vx, vz) > 0.01 ? -2 : -0.05;
  } else {
    hero.vy -= GRAVITY * DT;
    const canHover = hero.jumpHeld && hero.vy < -HOVER_FALL_SPEED && hero.hoverLeft > 0 && (entity.stamina?.current ?? 0) > 0;
    if (canHover) {
      hero.vy = -HOVER_FALL_SPEED;
      hero.hoverLeft -= 1;
      if (entity.stamina) {
        entity.stamina.current = Math.max(0, entity.stamina.current - perTick(HOVER_DRAIN_PER_SEC));
        hero.staminaDelay = STAMINA_DELAY;
      }
    }
  }

  const delta = { x: vx * DT, y: hero.vy * DT, z: vz * DT };
  const moved = physics?.moveCharacter(entity.id, delta);
  if (moved) {
    entity.position = moved.position;
    hero.grounded = moved.grounded && hero.vy <= 0;
  } else {
    // No physics (unit tests): walk on the terrain height.
    const next = { x: entity.position.x + delta.x, y: entity.position.y + delta.y, z: entity.position.z + delta.z };
    const ground = groundHeightAt(next.x, next.z);
    hero.grounded = next.y <= ground;
    if (hero.grounded) next.y = ground;
    entity.position = next;
  }
  if (hero.grounded && hero.vy < 0) hero.vy = 0;

  // Stay inside the meadow; if something goes wrong and the hero falls into the sea, put them back on the rock.
  const r = Math.hypot(entity.position.x, entity.position.z);
  if (r > MEADOW_RADIUS) {
    entity.position.x *= MEADOW_RADIUS / r;
    entity.position.z *= MEADOW_RADIUS / r;
  }
  if (entity.position.y < WATER_LEVEL - 6) {
    entity.position = { x: 0, y: groundHeightAt(0, 0), z: 0 };
    hero.vy = 0;
  }

  hero.moving = Math.hypot(vx, vz) > 0.5;
  hero.sprinting = sprinting && hero.moving;
}
