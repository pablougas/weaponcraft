import type { AttackSpec } from '../../content/types';
import { castSpirit } from './spirits';
import { applyDamage, isHittable, targetsInArc, targetsNear } from '../combat';
import { DT, GRAVITY, MEADOW_RADIUS, perTick, ticks } from '../constants';
import { godDef } from '../defs';
import { weaponData } from '../weapons';
import { interact } from './items';
import type { Intent, PlayerAction } from '../intents';
import type { PhysicsWorld } from '../physics';
import { meadowHeightAt, WATER_LEVEL } from '../terrain/meadow';
import { fallOutHeight, groundAt, isSafeFooting, regionBounds, regionClamp, regionOf, sameRegion, type RegionId } from '../regions';
import { isResting, updateRest } from './rest';
import { COMBO_WINDOW_TICKS, PUNCH_COMBO } from '../unarmed';
import type { Entity, EntityId, HeroState, Vec3, WorldState } from '../types';
import { despawn, spawn, type SimContext } from '../world';

/** Dodge roll (M3.1): fast and short, invulnerable at the start. */
export const DODGE_TICKS = 8; // ≈0.26 s
const DODGE_IFRAMES = 6; // 0.2 s
const DODGE_SPEED = 17; // ≈4.5 m
/** Rolling is cheap (team request): about 25 rolls from full stamina. */
export const DODGE_STAMINA = 4;
const SPRINT_DRAIN_PER_SEC = 18;
const HOVER_DRAIN_PER_SEC = 10;
/** Stamina refills fast (team request): empty to full in about 2 s. */
const STAMINA_REGEN_PER_SEC = 50;
/** Pause before stamina refills after spending it. */
const STAMINA_DELAY = ticks(0.3);
/** Longer pause after running dry while holding an ability, or after an ultimate. */
const EXHAUSTED_DELAY = ticks(1.2);
/** Slowest fall while hovering, m/s. */
const HOVER_FALL_SPEED = 1.1;
/** Turning speed toward the move direction, radians/s. */
const TURN_SPEED = 14;
const LOCK_RANGE = 20;
/** Lock-on breaks beyond this distance. */
const LOCK_BREAK_RANGE = 26;
/** A press made while busy is retried for this long (input buffer). */
const BUFFER_TICKS = 5; // ≈0.15 s
/** Holding the weapon button this long turns the strike into a heavy one. */
const HEAVY_HOLD_TICKS = 8;
/** Walking speed multiplier while charging a charged move. */
const CHARGE_MOVE_FACTOR = 0.4;
/** The charged move fires on its own this long after full charge. */
const OVERCHARGE_TICKS = 6;
/** How often the last safe position is recorded, and how far inside the edge it must be. */
const SAFE_EVERY = ticks(0.5);
const SAFE_EDGE_MARGIN = 3;
/** Feet this far below the terrain means the hero went through it: lift them out. */
const SINK_TOLERANCE = 0.3;
/** Trying to move while airborne and not moving this long means wedged: restore. */
const STUCK_TICKS = ticks(2);
/** Width of the soft edge where the meadow boundary starts pushing back, metres. */
const EDGE_ZONE = 5;

type HeroEntity = Entity & { hero: HeroState };
type BufferedAction = NonNullable<HeroState['buffer']>['action'];
const BUFFERED: ReadonlySet<PlayerAction> = new Set<PlayerAction>(['dodge', 'punch', 'lightAttack', 'heavyAttack']);

export function newHeroState(weaponId: string): HeroState {
  return heroDefaults({
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
  });
}

/** Fills in fields added after a save was made (M3.1), so old saves keep working. */
export function heroDefaults(hero: HeroState): HeroState {
  hero.abilityHeld ??= false;
  hero.chargeHeld ??= false;
  hero.weaponHeld ??= false;
  hero.weaponHoldTicks ??= -1;
  hero.charge ??= null;
  hero.combo ??= { step: 0, window: 0 };
  hero.buffer ??= null;
  hero.ultimate ??= null;
  hero.lastSafe ??= null;
  hero.safeTimer ??= 0;
  hero.stuckTicks ??= 0;
  return hero;
}

/** The hero entity a player controls, if spawned. */
export function playerHero(ctx: SimContext, playerId: string): HeroEntity | undefined {
  const entityId = ctx.world.players[playerId]?.entityId;
  const entity = entityId ? ctx.world.entities[entityId] : undefined;
  if (!entity?.hero) return undefined;
  heroDefaults(entity.hero);
  return entity as HeroEntity;
}

function spendStamina(entity: Entity, amount: number): boolean {
  if (!entity.stamina || entity.stamina.current < amount) return false;
  entity.stamina.current -= amount;
  if (entity.hero) entity.hero.staminaDelay = Math.max(entity.hero.staminaDelay, STAMINA_DELAY);
  return true;
}

function faceTowards(entity: Entity, x: number, z: number): void {
  entity.rotationY = Math.atan2(x - entity.position.x, z - entity.position.z);
}

/** The attack numbers for the hero's current attack. */
export function attackSpecFor(world: WorldState, entity: Entity, attack: NonNullable<HeroState['attack']>): AttackSpec {
  switch (attack.kind) {
    case 'punch':
      return PUNCH_COMBO[Math.max(0, Math.min(PUNCH_COMBO.length - 1, (attack.step ?? 1) - 1))];
    case 'fist': {
      const move = godDef(entity.defId).chargedMove;
      if (!move) return PUNCH_COMBO[2];
      return move.attack(attack.power ?? 0);
    }
    default:
      return weaponData(world, entity.hero!.weaponId)[attack.kind];
  }
}

/** Applies a player's move/action intent to their hero. Returns a rejection reason, or null. */
export function applyHeroIntent(ctx: SimContext, intent: Extract<Intent, { type: 'player:move' | 'player:action' }>): string | null {
  const entity = playerHero(ctx, intent.playerId);
  if (!entity) return 'no hero';
  const hero = entity.hero;
  if (isResting(hero)) return 'resting';

  if (intent.type === 'player:move') {
    const length = Math.hypot(intent.x, intent.z);
    const scale = length > 1 ? 1 / length : 1;
    hero.move = { x: (Number.isFinite(intent.x) ? intent.x : 0) * scale, z: (Number.isFinite(intent.z) ? intent.z : 0) * scale };
    hero.sprint = !!intent.sprint;
    hero.jumpHeld = !!intent.jumpHeld;
    hero.abilityHeld = !!intent.abilityHeld;
    hero.chargeHeld = !!intent.chargeHeld;
    hero.weaponHeld = !!intent.weaponHeld;
    if (typeof intent.aimYaw === 'number' && Number.isFinite(intent.aimYaw)) hero.aimYaw = intent.aimYaw;
    return null;
  }
  if (!ctx.isAuthority) return null;

  const reason = doAction(ctx, entity, intent.action);
  if (reason === 'busy' && BUFFERED.has(intent.action)) {
    // Pressed a moment too early: try again for a few ticks (input buffer).
    hero.buffer = { action: intent.action as BufferedAction, ticks: BUFFER_TICKS };
    return null;
  }
  return reason;
}

/** Performs one button action now. Returns a rejection reason, or null on success. */
export function doAction(ctx: SimContext, entity: HeroEntity, action: PlayerAction): string | null {
  const hero = entity.hero;
  const god = godDef(entity.defId);

  switch (action) {
    case 'jump':
      if (!hero.grounded || hero.dodge) return 'not grounded';
      hero.vy = god.jumpSpeed;
      hero.grounded = false;
      hero.hoverLeft = god.hoverTicks;
      ctx.emit('hero:jump', { entityId: entity.id });
      return null;
    case 'dodge': {
      if (hero.dodge || !hero.grounded) return 'busy';
      // Rolling cancels an attack's recovery (after its hit), but not its wind-up.
      if (hero.attack && !hero.attack.hit) return 'busy';
      if (!spendStamina(entity, DODGE_STAMINA)) return 'no stamina';
      const length = Math.hypot(hero.move.x, hero.move.z);
      // Roll where you're steering, or backward when no direction is held.
      const dir = length > 0.1
        ? { x: hero.move.x / length, z: hero.move.z / length }
        : { x: -Math.sin(entity.rotationY), z: -Math.cos(entity.rotationY) };
      hero.dodge = { ticksLeft: DODGE_TICKS, dir };
      hero.iframes = DODGE_IFRAMES;
      hero.attack = null;
      hero.charge = null;
      if (length > 0.1) entity.rotationY = Math.atan2(dir.x, dir.z);
      ctx.emit('hero:dodge', { entityId: entity.id });
      return null;
    }
    case 'punch': {
      if (hero.attack || hero.dodge || hero.charge != null) return 'busy';
      const combo = hero.combo!;
      const step = combo.window > 0 ? (combo.step % PUNCH_COMBO.length) + 1 : 1;
      if (!spendStamina(entity, PUNCH_COMBO[step - 1].staminaCost)) return 'no stamina';
      hero.attack = { kind: 'punch', tick: 0, hit: false, step };
      combo.window = 0;
      faceLockTarget(ctx, entity);
      ctx.emit('hero:attack', { entityId: entity.id, kind: 'punch' });
      return null;
    }
    case 'lightAttack':
    case 'heavyAttack': {
      if (hero.attack || hero.dodge || hero.charge != null) return 'busy';
      const kind = action === 'lightAttack' ? 'light' : 'heavy';
      const spec = weaponData(ctx.world, hero.weaponId)[kind];
      if (!spendStamina(entity, spec.staminaCost)) return 'no stamina';
      hero.attack = { kind, tick: 0, hit: false };
      faceLockTarget(ctx, entity);
      ctx.emit('hero:attack', { entityId: entity.id, kind });
      return null;
    }
    case 'godAbility':
      return castAbility(ctx, entity);
    case 'blink': {
      const blink = god.blink;
      if (!blink) return 'no blink';
      if (hero.ultimate || hero.blink) return 'busy';
      if ((hero.cooldowns[blink.id] ?? 0) > 0) return 'cooling down';
      if (!spendStamina(entity, blink.staminaCost)) return 'no stamina';
      // Jump to the lock-on target (stopping just in front of it), else where you're steering, else ahead.
      const lock = hero.lockTarget ? ctx.world.entities[hero.lockTarget] : undefined;
      const toLock = lock ? Math.hypot(lock.position.x - entity.position.x, lock.position.z - entity.position.z) : Infinity;
      let dir: { x: number; z: number };
      let distance = blink.range;
      if (lock && toLock <= blink.lockRange && toLock > 0.01) {
        dir = { x: (lock.position.x - entity.position.x) / toLock, z: (lock.position.z - entity.position.z) / toLock };
        // Bolt Step stops just in front; Shadow Step reappears just behind.
        distance = blink.behindTarget ? toLock + (lock.body?.radius ?? 0.4) + 1.1 : Math.max(0, toLock - (lock.body?.radius ?? 0.4) - 1);
      } else {
        const length = Math.hypot(hero.move.x, hero.move.z);
        dir = length > 0.1 ? { x: hero.move.x / length, z: hero.move.z / length } : { x: Math.sin(entity.rotationY), z: Math.cos(entity.rotationY) };
      }
      hero.blink = { dx: dir.x * distance, dz: dir.z * distance };
      hero.cooldowns[blink.id] = blink.cooldownTicks;
      hero.iframes = Math.max(hero.iframes, blink.iframeTicks);
      hero.attack = null;
      hero.dodge = null;
      entity.rotationY = Math.atan2(dir.x, dir.z);
      if (blink.ambush) hero.ambush = { ...blink.ambush };
      if (blink.decoyTicks && ctx.isAuthority) {
        const id = spawn(ctx, 'shadow-decoy', { position: { ...entity.position }, rotationY: entity.rotationY });
        const decoy = ctx.world.entities[id];
        decoy.decoy = { ownerId: entity.id, ticksLeft: blink.decoyTicks };
        decoy.region = entity.region;
      }
      return null;
    }
    case 'ultimate': {
      const ultimate = god.ultimate;
      if (!ultimate) return 'no ultimate';
      if (hero.ultimate) return 'busy';
      if ((hero.cooldowns[ultimate.id] ?? 0) > 0) return 'cooling down';
      const stamina = entity.stamina;
      if (!stamina || stamina.current < stamina.max * ultimate.minStaminaFraction) return 'no stamina';
      const point = ultimate.target(ctx, entity.id);
      if (!point) return 'no effect';
      const spent = stamina.current;
      stamina.current = 0;
      hero.staminaDelay = EXHAUSTED_DELAY;
      hero.cooldowns[ultimate.id] = ultimate.cooldownTicks;
      // +1: the hero update later this same tick counts the first tick down.
      hero.ultimate = { ticksLeft: ultimate.telegraphTicks + 1, point, spent };
      faceTowards(entity, point.x, point.z);
      ctx.emit('ability:telegraph', { casterId: entity.id, abilityId: ultimate.id, point, radius: ultimate.radius, ticks: ultimate.telegraphTicks });
      return null;
    }
    case 'spiritAbility':
      return castSpirit(ctx, entity);
    case 'lockOn':
      hero.lockTarget = hero.lockTarget ? null : findLockTarget(ctx, entity);
      return null;
    case 'interact':
      return interact(ctx, entity.ownerId ?? '');
    default:
      return 'unknown action';
  }
}

function faceLockTarget(ctx: SimContext, entity: HeroEntity): void {
  const target = entity.hero.lockTarget ? ctx.world.entities[entity.hero.lockTarget] : undefined;
  if (target) faceTowards(entity, target.position.x, target.position.z);
}

/** Casts the god ability if it's ready and affordable. */
export function castAbility(ctx: SimContext, entity: HeroEntity): string | null {
  const hero = entity.hero;
  const ability = godDef(entity.defId).ability;
  if ((hero.cooldowns[ability.id] ?? 0) > 0) return 'cooling down';
  if (!entity.stamina || entity.stamina.current < ability.staminaCost) return 'no stamina';
  if (!ability.cast(ctx, entity.id)) return 'no effect';
  spendStamina(entity, ability.staminaCost);
  hero.cooldowns[ability.id] = ability.cooldownTicks;
  return null;
}

/** Nearest hittable entity within range, preferring ones in front of the hero. */
function findLockTarget(ctx: SimContext, entity: Entity): EntityId | null {
  const fx = Math.sin(entity.rotationY);
  const fz = Math.cos(entity.rotationY);
  let best: { id: EntityId; score: number } | null = null;
  for (const other of Object.values(ctx.world.entities)) {
    if (other.id === entity.id || other.hero || !isHittable(other) || !sameRegion(other, entity)) continue;
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
    // Shadow decoys fade on their own.
    if (entity.decoy && --entity.decoy.ticksLeft <= 0 && ctx.isAuthority) {
      despawn(ctx, entity.id);
      continue;
    }
    if (entity.hero) {
      heroDefaults(entity.hero);
      updateHero(ctx, entity as HeroEntity, physics);
    }
  }
}

/** Held buttons: repeat-fire the ability, charge and release the charged move, tap/hold the weapon. */
function updateHeldButtons(ctx: SimContext, entity: HeroEntity): void {
  if (!ctx.isAuthority) return;
  const hero = entity.hero;
  const god = godDef(entity.defId);

  // Q held: keep firing at the ability's rate while stamina lasts.
  const ability = god.ability;
  if (ability.repeatWhileHeld && hero.abilityHeld && (hero.cooldowns[ability.id] ?? 0) === 0 && !hero.dodge) {
    const reason = castAbility(ctx, entity);
    if (reason === 'no stamina') {
      if (hero.staminaDelay < EXHAUSTED_DELAY - 1) ctx.emit('hero:exhausted', { entityId: entity.id });
      hero.staminaDelay = EXHAUSTED_DELAY;
    }
  }

  // D: start charging on press, throw on release (or on its own when overcharged).
  const move = god.chargedMove;
  if (move) {
    if (hero.charge == null) {
      const ready = (hero.cooldowns[move.id] ?? 0) === 0 && !hero.attack && !hero.dodge;
      if (hero.chargeHeld && ready && (entity.stamina?.current ?? 0) >= move.staminaMin) {
        hero.charge = 0;
        hero.chargeHeld = true;
        ctx.emit('hero:charge', { entityId: entity.id, abilityId: move.id });
      }
    } else {
      hero.charge += 1;
      if (!hero.chargeHeld || hero.charge >= move.fullChargeTicks + OVERCHARGE_TICKS) {
        let power = Math.min(1, hero.charge / move.fullChargeTicks);
        const stamina = entity.stamina?.current ?? 0;
        const cost = move.staminaMin + (move.staminaMax - move.staminaMin) * power;
        if (stamina < cost) power = Math.max(0, (stamina - move.staminaMin) / (move.staminaMax - move.staminaMin));
        spendStamina(entity, move.staminaMin + (move.staminaMax - move.staminaMin) * power);
        hero.charge = null;
        hero.cooldowns[move.id] = move.cooldownTicks;
        hero.attack = { kind: 'fist', tick: 0, hit: false, power };
        faceLockTarget(ctx, entity);
        ctx.emit('hero:attack', { entityId: entity.id, kind: 'fist', power, abilityId: move.id });
        // Don't start charging again until the button is pressed again.
        hero.chargeHeld = false;
      }
    }
  }

  // S: a short tap is a light strike; holding past the threshold is a heavy one.
  const holding = hero.weaponHoldTicks!;
  if (hero.weaponHeld) {
    if (holding < 0 && holding !== -2) hero.weaponHoldTicks = 0;
    else if (holding >= 0) {
      hero.weaponHoldTicks = holding + 1;
      if (holding + 1 >= HEAVY_HOLD_TICKS) {
        tryOrBuffer(ctx, entity, 'heavyAttack');
        hero.weaponHoldTicks = -2; // spent: wait for release
      }
    }
  } else {
    if (holding >= 0) tryOrBuffer(ctx, entity, 'lightAttack');
    hero.weaponHoldTicks = -1;
  }
}

function tryOrBuffer(ctx: SimContext, entity: HeroEntity, action: BufferedAction): void {
  if (doAction(ctx, entity, action) === 'busy') entity.hero.buffer = { action, ticks: BUFFER_TICKS };
}

function updateHero(ctx: SimContext, entity: HeroEntity, physics: PhysicsWorld | undefined): void {
  const { world } = ctx;
  const hero = entity.hero;
  const god = godDef(entity.defId);
  if (updateRest(ctx, entity)) {
    hero.moving = false;
    hero.sprinting = false;
    return;
  }

  hero.iframes = Math.max(0, hero.iframes - 1);
  if (hero.ambush && --hero.ambush.ticks <= 0) hero.ambush = null;
  hero.hurtTicks = Math.max(0, hero.hurtTicks - 1);
  hero.staminaDelay = Math.max(0, hero.staminaDelay - 1);
  for (const id of Object.keys(hero.cooldowns)) {
    hero.cooldowns[id] = Math.max(0, hero.cooldowns[id] - 1);
    if (hero.cooldowns[id] === 0) delete hero.cooldowns[id];
  }
  if (hero.combo!.window > 0) hero.combo!.window -= 1;
  if (god.ability.update) god.ability.update(ctx, entity.id);

  // A press made while busy (input buffer): retry until it works or expires.
  if (hero.buffer && ctx.isAuthority) {
    const reason = doAction(ctx, entity, hero.buffer.action);
    hero.buffer.ticks -= 1;
    if (reason !== 'busy' || hero.buffer.ticks <= 0) hero.buffer = null;
  }
  updateHeldButtons(ctx, entity);

  // A called-down ultimate lands after its marker.
  if (hero.ultimate) {
    hero.ultimate.ticksLeft -= 1;
    if (hero.ultimate.ticksLeft <= 0) {
      const ultimate = god.ultimate;
      const { point, spent } = hero.ultimate;
      hero.ultimate = null;
      if (ultimate && ctx.isAuthority) {
        const targetIds = ultimate.land(ctx, entity.id, point, spent);
        ctx.emit('ability:strike', { casterId: entity.id, abilityId: ultimate.id, point, radius: ultimate.radius, targetIds });
      }
    }
  }

  if (hero.lockTarget) {
    const target = world.entities[hero.lockTarget];
    if (!isHittable(target) || !sameRegion(target, entity) || Math.hypot(target.position.x - entity.position.x, target.position.z - entity.position.z) > LOCK_BREAK_RANGE) {
      hero.lockTarget = null;
    }
  }

  if (hero.blink) performBlink(ctx, entity, physics);

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
    const attack = hero.attack;
    const spec = attackSpecFor(world, entity, attack);
    attack.tick += 1;
    // Lunge forward during the wind-up, but stop once a target is within easy reach
    // (so a long lunge never carries the hero past the enemy).
    if (attack.tick < spec.hitTick && targetsInArc(world, entity, spec.range * 0.6, spec.arcDeg).length === 0) {
      vx = Math.sin(entity.rotationY) * spec.lunge;
      vz = Math.cos(entity.rotationY) * spec.lunge;
    }
    if (!attack.hit && attack.tick >= spec.hitTick) {
      attack.hit = true;
      const targets = targetsInArc(world, entity, spec.range, spec.arcDeg);
      const kind = attack.kind;
      // Weapon strikes carry the weapon's element; punches have none; the fist is the god's move.
      const element = kind === 'light' || kind === 'heavy'
        ? weaponData(world, hero.weaponId).element
        : kind === 'fist' ? god.chargedMove?.element ?? null : null;
      for (const id of spec.cleave ? targets : targets.slice(0, 1)) {
        applyDamage(ctx, id, spec.damage, entity.id, kind === 'fist' ? 'ability' : kind, element);
        if (kind === 'fist') god.chargedMove?.onHit?.(ctx, entity.id, id, attack.power ?? 0);
      }
    }
    if (attack.tick >= spec.totalTicks) {
      if (attack.kind === 'punch') hero.combo = { step: attack.step ?? 1, window: COMBO_WINDOW_TICKS };
      hero.attack = null;
    }
  } else if (moveLength > 0.05) {
    const charging = hero.charge != null;
    sprinting = !charging && hero.sprint && !!entity.stamina && entity.stamina.current > 0;
    const speed = (sprinting ? god.sprintSpeed : god.walkSpeed) * (charging ? CHARGE_MOVE_FACTOR : 1);
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
      hero.staminaDelay = Math.max(hero.staminaDelay, STAMINA_DELAY);
    } else if (hero.staminaDelay === 0 && hero.charge == null) {
      const passive = god.passive && regionOf(entity) === 'underworld' ? god.passive.staminaRegenMultiplier : 1;
      entity.stamina.current = Math.min(entity.stamina.max, entity.stamina.current + perTick(STAMINA_REGEN_PER_SEC * passive));
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
        hero.staminaDelay = Math.max(hero.staminaDelay, STAMINA_DELAY);
      }
    }
  }

  // Meadow edge: a soft wall. Never teleport the hero for it (that pushed the
  // feet under the hillside and wedged the capsule, M3.1 bug); instead remove
  // the outward part of the movement and nudge back inside.
  ({ vx, vz } = applyEdge(entity.position, vx, vz, regionOf(entity)));

  const before = { ...entity.position };
  const delta = { x: vx * DT, y: hero.vy * DT, z: vz * DT };
  const moved = physics?.moveCharacter(entity.id, delta);
  if (moved) {
    entity.position = moved.position;
    hero.grounded = moved.grounded && hero.vy <= 0;
  } else {
    // No physics (unit tests): walk on the terrain height.
    const next = { x: entity.position.x + delta.x, y: entity.position.y + delta.y, z: entity.position.z + delta.z };
    const ground = groundAt(regionOf(entity), next.x, next.z);
    hero.grounded = next.y <= ground;
    if (hero.grounded) next.y = ground;
    entity.position = next;
  }
  if (hero.grounded && hero.vy < 0) hero.vy = 0;

  keepOutOfTheGround(ctx, entity, before, moveLength > 0.05 || !!hero.dodge);

  hero.moving = Math.hypot(vx, vz) > 0.5;
  hero.sprinting = sprinting && hero.moving;
}

/**
 * Keeps movement inside the region (the meadow, or the grotto): within
 * EDGE_ZONE of the edge the outward part of the velocity fades to zero, and
 * past the edge it pushes back in.
 */
export function applyEdge(position: Vec3, vx: number, vz: number, region: RegionId = 'surface'): { vx: number; vz: number } {
  if (region === 'underworld') {
    // The grotto, tunnel and fields: rock walls and cliffs stop you; past the edge, push back in.
    const clamp = regionClamp(region, position.x, position.z);
    if (clamp.inside) return { vx, vz };
    const dx = clamp.x - position.x;
    const dz = clamp.z - position.z;
    const d = Math.hypot(dx, dz) || 1;
    const push = Math.min(4, d * 4 + 1);
    const inward = vx * (dx / d) + vz * (dz / d);
    if (inward < 0) {
      vx -= (dx / d) * inward;
      vz -= (dz / d) * inward;
    }
    return { vx: vx + (dx / d) * push, vz: vz + (dz / d) * push };
  }
  const bounds = regionBounds(region);
  const zone = region === 'surface' ? EDGE_ZONE : 1.5;
  const dx = position.x - bounds.x;
  const dz = position.z - bounds.z;
  const r = Math.hypot(dx, dz);
  if (r < bounds.radius - zone || r < 0.01) return { vx, vz };
  const nx = dx / r;
  const nz = dz / r;
  const outward = vx * nx + vz * nz;
  if (outward > 0) {
    const keep = Math.max(0, (bounds.radius - r) / zone);
    vx -= nx * outward * (1 - keep);
    vz -= nz * outward * (1 - keep);
  }
  if (r > bounds.radius) {
    const push = Math.min(4, (r - bounds.radius) * 4 + 1);
    vx -= nx * push;
    vz -= nz * push;
  }
  return { vx, vz };
}

/**
 * Safety net (M3.1): feet must never be below the terrain; a hero that falls
 * out of the world or stays wedged is put back on the last safe spot.
 */
function keepOutOfTheGround(ctx: SimContext, entity: HeroEntity, before: Vec3, tryingToMove: boolean): void {
  const hero = entity.hero;
  const p = entity.position;
  const region = regionOf(entity);
  const terrain = region === 'surface' ? meadowHeightAt(p.x, p.z) : groundAt(region, p.x, p.z);
  if (p.y < terrain - SINK_TOLERANCE) {
    entity.position = { x: p.x, y: terrain, z: p.z };
    hero.vy = 0;
    hero.grounded = true;
  }

  const bounds = regionBounds(region);
  hero.safeTimer = Math.max(0, hero.safeTimer! - 1);
  if (hero.grounded && hero.safeTimer === 0 && regionClamp(region, entity.position.x, entity.position.z, SAFE_EDGE_MARGIN).inside && isSafeFooting(region, entity.position)) {
    hero.lastSafe = { ...entity.position };
    hero.safeTimer = SAFE_EVERY;
  }

  const movedFlat = Math.hypot(entity.position.x - before.x, entity.position.z - before.z);
  hero.stuckTicks = tryingToMove && !hero.grounded && movedFlat < 0.01 && Math.abs(entity.position.y - before.y) < 0.01
    ? hero.stuckTicks! + 1
    : 0;

  const fellOut = entity.position.y < fallOutHeight(region);
  if (fellOut || hero.stuckTicks! >= STUCK_TICKS) {
    const safe = hero.lastSafe ?? { x: bounds.x, y: groundAt(region, bounds.x, bounds.z), z: bounds.z };
    entity.position = { ...safe };
    hero.vy = 0;
    hero.grounded = true;
    hero.stuckTicks = 0;
    hero.dodge = null;
    ctx.emit('hero:recovered', { entityId: entity.id, reason: fellOut ? 'fell out of the world' : 'stuck' });
  }
}

/**
 * Bolt Step: moves the god through the character controller (so rocks,
 * trees and creatures stop it), keeps the landing inside the meadow, then
 * bursts lightning around the landing spot.
 */
function performBlink(ctx: SimContext, entity: HeroEntity, physics: PhysicsWorld | undefined): void {
  const hero = entity.hero;
  const blink = godDef(entity.defId).blink;
  const jump = hero.blink;
  hero.blink = null;
  if (!blink || !jump) return;
  const from = { ...entity.position };
  const region = regionOf(entity);
  const target = regionClamp(region, from.x + jump.dx, from.z + jump.dz, 2);
  const tx = target.x;
  const tz = target.z;
  const dx = tx - from.x;
  const dz = tz - from.z;
  if (physics) {
    // Half-metre steps: one long sweep stops at the first bump in the terrain,
    // while short steps climb and step up like walking does.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
    for (let i = 0; i < steps; i += 1) {
      const moved = physics.moveCharacter(entity.id, { x: dx / steps, y: -0.05, z: dz / steps });
      if (moved) entity.position = moved.position;
    }
  } else {
    entity.position = { x: tx, y: groundAt(region, tx, tz), z: tz };
  }
  // Never end up under the terrain (the M3.1 safety rule).
  const ground = groundAt(region, entity.position.x, entity.position.z);
  if (entity.position.y < ground) entity.position.y = ground;
  const to = { ...entity.position };
  // Shadow Step lands behind the target, facing it.
  const lock = hero.lockTarget ? ctx.world.entities[hero.lockTarget] : undefined;
  if (blink.behindTarget && lock) entity.rotationY = Math.atan2(lock.position.x - to.x, lock.position.z - to.z);
  const targetIds = blink.burstRadius > 0 ? targetsNear(ctx.world, to, blink.burstRadius, new Set([entity.id])) : [];
  for (const id of targetIds) applyDamage(ctx, id, blink.burstDamage, entity.id, 'ability', blink.element);
  ctx.emit('ability:blink', { casterId: entity.id, abilityId: blink.id, from, to, targetIds });
}
