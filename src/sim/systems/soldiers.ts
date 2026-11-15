import { applyDamage, isHittable } from '../combat';
import { DT, ticks } from '../constants';
import type { PhysicsWorld } from '../physics';
import { GROTTO, groundAt } from '../regions';
import { FORT_RADIUS, FORT_SPOTS, SPIRES } from '../terrain/underworld';
import type { Entity, EntityId, SoldierKind, SoldierState, Vec3 } from '../types';
import { despawn, spawn, type SimContext } from '../world';
import { isResting } from './rest';

/**
 * The humans in the Underworld (SPEC §9, M6): soldiers in small forts and
 * lone sentries on the approaches. Soldiers patrol → grow suspicious → raise
 * the alarm → attack → search → return. Sentries stand still and sweep a
 * visible sight cone; if they see a god they raise the alarm and nearby
 * soldiers come running. Everything here is deterministic sim logic.
 */
interface SoldierSpec {
  maxHealth: number;
  body: { radius: number; height: number };
  walk: number;
  run: number;
  sight: number;
  /** Half-angle of the sight cone, radians. */
  cone: number;
  /** Awareness gained per tick while seen (×2 when close). */
  notice: number;
  attackRange: number;
  windup: number;
  cooldown: number;
  damage: number;
}

export const SOLDIER_SPECS: Readonly<Record<SoldierKind, SoldierSpec>> = {
  spear: { maxHealth: 60, body: { radius: 0.36, height: 1.8 }, walk: 1.6, run: 3.8, sight: 18, cone: 0.9, notice: 1.2, attackRange: 2, windup: ticks(0.5), cooldown: ticks(1.4), damage: 10 },
  shield: { maxHealth: 85, body: { radius: 0.42, height: 1.8 }, walk: 1.4, run: 3.2, sight: 16, cone: 0.9, notice: 1.2, attackRange: 1.9, windup: ticks(0.55), cooldown: ticks(1.6), damage: 8 },
  archer: { maxHealth: 45, body: { radius: 0.34, height: 1.8 }, walk: 1.6, run: 3.6, sight: 22, cone: 0.8, notice: 1.4, attackRange: 14, windup: ticks(0.9), cooldown: ticks(1.8), damage: 9 },
  sentry: { maxHealth: 40, body: { radius: 0.34, height: 1.8 }, walk: 0, run: 0, sight: 26, cone: 0.6, notice: 1.6, attackRange: 0, windup: 0, cooldown: 0, damage: 0 },
};

/** Awareness levels (0–100): suspicious, then alert. */
export const SUSPICIOUS_AT = 25;
export const ALERT_AT = 60;
/** Anyone this close is noticed whatever way the soldier faces (footsteps). */
const HEAR_RANGE = 3.5;
/** A soldier raising the alarm alerts these within this range; a sentry's horn carries further. */
const SHOUT_RANGE = 26;
const HORN_RANGE = 55;
const LOSE_TARGET_TICKS = ticks(3);
const SEARCH_TICKS = ticks(5);
const ARROW_SPEED = 26;
const ARROW_TICKS = ticks(1.2);

/** The Underworld's human garrison: 3 forts on the main path and 4 sentries on the approaches. */
const FORT_GARRISONS: ReadonlyArray<readonly SoldierKind[]> = [
  ['spear', 'spear', 'archer'],
  ['spear', 'shield', 'archer', 'spear'],
  ['shield', 'spear', 'archer', 'archer', 'spear'],
];
export const SENTRY_POSTS: ReadonlyArray<{ x: number; z: number; facing: number }> = [
  { x: 14, z: -120, facing: 0 },
  { x: -22, z: -268, facing: 0.4 },
  { x: 36, z: -410, facing: -0.3 },
  { x: -14, z: -540, facing: 0 },
];

const local = (x: number, z: number): Vec3 => ({ x: GROTTO.center.x + x, y: groundAt('underworld', GROTTO.center.x + x, GROTTO.center.z + z), z: GROTTO.center.z + z });

/** Places the forts' soldiers and the sentries, once (when the Underworld opens up). */
export function ensureGarrison(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.garrisonPlaced) return;
  FORT_SPOTS.forEach((fort, f) => {
    const kinds = FORT_GARRISONS[f];
    kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + f;
      const r = kind === 'archer' ? FORT_RADIUS * 0.35 : FORT_RADIUS * 0.6;
      const home = local(fort.x + Math.cos(a) * r, fort.z + Math.sin(a) * r);
      // Patrols walk a loop just inside the palisade; archers hold their spot.
      const patrol = kind === 'archer' ? [] : [0, 1, 2, 3].map((k) => {
        const pa = a + (k * Math.PI) / 2;
        return local(fort.x + Math.cos(pa) * FORT_RADIUS * 0.6, fort.z + Math.sin(pa) * FORT_RADIUS * 0.6);
      });
      spawnSoldier(ctx, kind, home, a + Math.PI, fort.id, patrol);
    });
    world.forts[fort.id] = { cleared: false, chestOpened: false };
    const chest = spawn(ctx, 'chest', { position: local(fort.x, fort.z - 3), rotationY: 0 });
    Object.assign(world.entities[chest], { structure: { kind: 'chest' }, region: 'underworld', fortId: fort.id, body: { radius: 0.6, height: 0.8 } });
  });
  for (const post of SENTRY_POSTS) spawnSoldier(ctx, 'sentry', local(post.x, post.z), Math.PI + post.facing, null, []);
  world.flags.garrisonPlaced = true;
}

function spawnSoldier(ctx: SimContext, kind: SoldierKind, home: Vec3, facing: number, fortId: string | null, patrol: Vec3[]): EntityId {
  const spec = SOLDIER_SPECS[kind];
  const id = spawn(ctx, kind === 'sentry' ? 'sentry' : `soldier-${kind}`, { position: { ...home }, rotationY: facing });
  const e = ctx.world.entities[id];
  e.region = 'underworld';
  e.body = { ...spec.body };
  e.health = { current: spec.maxHealth, max: spec.maxHealth };
  e.creature = { wanders: false, hostile: true, home: { ...home }, target: null, wait: 0, flee: 0, sinceHit: ticks(60) };
  e.soldier = { kind, fortId, state: 'patrol', awareness: 0, targetId: null, lastSeen: null, timer: 0, patrol, patrolIndex: 0, facing, postFacing: facing, windup: 0, cooldown: 0, scan: 0 };
  return id;
}

/** Is the line from a to b blocked by a spire? (Rock cover for sneaking.) */
function blockedBySpire(a: Vec3, b: Vec3): boolean {
  const ax = a.x - GROTTO.center.x;
  const az = a.z - GROTTO.center.z;
  const bx = b.x - GROTTO.center.x;
  const bz = b.z - GROTTO.center.z;
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  for (const s of SPIRES) {
    const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / len2));
    if (Math.hypot(ax + dx * t - s.x, az + dz * t - s.z) < s.radius * 0.9) return true;
  }
  return false;
}

/** Can this soldier see `target` right now? */
export function canSee(soldier: Entity & { soldier: SoldierState }, target: Entity): boolean {
  if ((target.region ?? 'surface') !== 'underworld') return false;
  const spec = SOLDIER_SPECS[soldier.soldier.kind];
  const dx = target.position.x - soldier.position.x;
  const dz = target.position.z - soldier.position.z;
  const d = Math.hypot(dx, dz);
  if (d > spec.sight) return false;
  if (d > HEAR_RANGE) {
    const facing = soldier.soldier.facing;
    const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - facing), Math.cos(Math.atan2(dx, dz) - facing)));
    if (angle > spec.cone) return false;
  }
  return !blockedBySpire(soldier.position, target.position);
}

/** Things soldiers notice and chase: gods (not resting or fallen) and Shadow Step decoys. */
function targetsFor(ctx: SimContext): Entity[] {
  return Object.values(ctx.world.entities).filter((e) => (e.hero && !isResting(e.hero) && isHittable(e)) || e.decoy);
}

function raiseAlarm(ctx: SimContext, from: Entity & { soldier: SoldierState }, at: Vec3, range: number): void {
  for (const other of Object.values(ctx.world.entities)) {
    if (!other.soldier || other.id === from.id || other.soldier.kind === 'sentry') continue;
    if (Math.hypot(other.position.x - from.position.x, other.position.z - from.position.z) > range) continue;
    if (other.soldier.state === 'attack') continue;
    other.soldier.state = 'attack';
    other.soldier.awareness = 100;
    other.soldier.lastSeen = { ...at };
    other.soldier.timer = 0;
  }
  ctx.emit('soldier:alarm', { entityId: from.id, kind: from.soldier.kind, at: { ...at } });
}

function move(entity: Entity, dx: number, dz: number, physics?: PhysicsWorld): void {
  const moved = physics?.moveCharacter(entity.id, { x: dx, y: -0.25, z: dz });
  if (moved) entity.position = moved.position;
  else {
    const x = entity.position.x + dx;
    const z = entity.position.z + dz;
    entity.position = { x, y: groundAt('underworld', x, z), z };
  }
}

function walkToward(entity: Entity & { soldier: SoldierState }, to: Vec3, speed: number, stopAt: number, physics?: PhysicsWorld): number {
  const dx = to.x - entity.position.x;
  const dz = to.z - entity.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.01) {
    entity.soldier.facing = Math.atan2(dx, dz);
    entity.rotationY = entity.soldier.facing;
  }
  if (d > stopAt) {
    const stepLen = Math.min(d - stopAt, speed * DT);
    move(entity, (dx / d) * stepLen, (dz / d) * stepLen, physics);
  } else {
    move(entity, 0, 0, physics);
  }
  return d;
}

/** Advances every soldier and sentry, and the arrows in flight (authority only). */
export function updateSoldiers(ctx: SimContext, physics?: PhysicsWorld): void {
  if (!ctx.isAuthority) return;
  const { world } = ctx;
  const targets = targetsFor(ctx);
  for (const entity of Object.values(world.entities)) {
    if (entity.projectile) {
      updateArrow(ctx, entity);
      continue;
    }
    if (!entity.soldier || !entity.health) continue;
    if (entity.health.current <= 0) {
      const fortId = entity.soldier.fortId;
      despawn(ctx, entity.id);
      if (fortId) checkFortCleared(ctx, fortId);
      continue;
    }
    updateSoldier(ctx, entity as Entity & { soldier: SoldierState }, targets, physics);
  }
}

function updateSoldier(ctx: SimContext, e: Entity & { soldier: SoldierState }, targets: Entity[], physics?: PhysicsWorld): void {
  const s = e.soldier;
  const spec = SOLDIER_SPECS[s.kind];
  const creature = e.creature!;
  s.cooldown = Math.max(0, s.cooldown - 1);

  // Knocked back or stunned (Lightning Fist, Grasp of the Dead, Skull Cage): no walking or attacking.
  if (creature.knock && creature.knock.ticks > 0) {
    creature.knock.ticks -= 1;
    move(e, creature.knock.x * DT, creature.knock.z * DT, physics);
    if (creature.knock.ticks <= 0) creature.knock = null;
    if (creature.stun) creature.stun = Math.max(0, creature.stun - 1);
    s.windup = 0;
    return;
  }
  if (creature.stun && creature.stun > 0) {
    creature.stun -= 1;
    s.windup = 0;
    move(e, 0, 0, physics);
    return;
  }
  // Being hit gives you away.
  if (creature.sinceHit === 0 && s.state !== 'attack') {
    s.awareness = Math.max(s.awareness, ALERT_AT);
  }
  creature.sinceHit += 1;

  // Perception: decoys first (that's what they're for), then the nearest god in sight.
  const seen = targets
    .filter((t) => canSee(e, t))
    .map((t) => ({ t, d: Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z) }))
    .sort((a, b) => (a.t.decoy ? 0 : 1) - (b.t.decoy ? 0 : 1) || a.d - b.d || a.t.id.localeCompare(b.t.id))[0];
  if (seen) {
    s.awareness = Math.min(100, s.awareness + spec.notice * (seen.d < 8 ? 2.5 : 1));
    s.lastSeen = { ...seen.t.position };
    s.targetId = seen.t.id;
    s.timer = 0;
  } else {
    s.timer += 1;
    if (s.state === 'patrol' || s.state === 'suspicious') s.awareness = Math.max(0, s.awareness - 0.4);
  }

  if (s.kind === 'sentry') {
    updateSentry(ctx, e, !!seen);
    return;
  }

  // State changes.
  if (s.state === 'patrol' && s.awareness >= SUSPICIOUS_AT) {
    s.state = 'suspicious';
    ctx.emit('soldier:suspicious', { entityId: e.id });
  }
  if ((s.state === 'patrol' || s.state === 'suspicious' || s.state === 'search' || s.state === 'return') && s.awareness >= ALERT_AT && s.lastSeen) {
    s.state = 'attack';
    s.timer = 0;
    raiseAlarm(ctx, e, s.lastSeen, SHOUT_RANGE);
  }
  if (s.state === 'suspicious' && s.awareness <= 0) s.state = 'return';
  if (s.state === 'attack' && s.timer > LOSE_TARGET_TICKS) {
    s.state = 'search';
    s.timer = 0;
    s.windup = 0;
  }

  switch (s.state) {
    case 'patrol': {
      if (s.patrol.length === 0) {
        walkToward(e, creature.home, spec.walk, 0.3, physics);
        return;
      }
      const point = s.patrol[s.patrolIndex % s.patrol.length];
      if (creature.wait > 0) {
        creature.wait -= 1;
        move(e, 0, 0, physics);
        return;
      }
      if (walkToward(e, point, spec.walk, 0.4, physics) <= 0.5) {
        s.patrolIndex = (s.patrolIndex + 1) % s.patrol.length;
        creature.wait = ticks(2);
      }
      return;
    }
    case 'suspicious':
      // Turn and edge toward what they glimpsed.
      if (s.lastSeen) walkToward(e, s.lastSeen, spec.walk * 0.6, 4, physics);
      return;
    case 'attack': {
      const target = s.targetId ? ctx.world.entities[s.targetId] : undefined;
      const goal = target && s.timer === 0 ? target.position : s.lastSeen;
      if (!goal) return;
      if (s.kind === 'archer') {
        const d = Math.hypot(goal.x - e.position.x, goal.z - e.position.z);
        // Keep 8–14 m away and shoot.
        if (d < 7) {
          const away = { x: e.position.x * 2 - goal.x, y: e.position.y, z: e.position.z * 2 - goal.z };
          walkToward(e, away, spec.run * 0.7, 0, physics);
          e.soldier.facing = Math.atan2(goal.x - e.position.x, goal.z - e.position.z);
          e.rotationY = e.soldier.facing;
        } else {
          walkToward(e, goal, spec.run, spec.attackRange - 2, physics);
        }
        if (target && s.timer === 0) tryAttack(ctx, e, target, d);
        return;
      }
      const d = walkToward(e, goal, s.windup > 0 ? 0 : spec.run, spec.attackRange - 0.3, physics);
      if (target && s.timer === 0) tryAttack(ctx, e, target, d);
      return;
    }
    case 'search': {
      if (s.lastSeen && walkToward(e, s.lastSeen, spec.walk * 1.4, 0.6, physics) > 0.8) return;
      // Look around a while, then go home.
      s.facing += 0.05;
      e.rotationY = s.facing;
      if (s.timer > SEARCH_TICKS) {
        s.state = 'return';
        s.awareness = 0;
      }
      return;
    }
    case 'return': {
      const home = s.patrol[s.patrolIndex % Math.max(1, s.patrol.length)] ?? creature.home;
      if (walkToward(e, home, spec.walk, 0.4, physics) <= 0.5) {
        s.state = 'patrol';
        s.awareness = 0;
        s.targetId = null;
      }
      return;
    }
  }
}

function tryAttack(ctx: SimContext, e: Entity & { soldier: SoldierState }, target: Entity, distance: number): void {
  const s = e.soldier;
  const spec = SOLDIER_SPECS[s.kind];
  if (s.windup > 0) {
    s.windup -= 1;
    if (s.windup > 0) return;
    // Release: the archer looses an arrow; melee soldiers strike if still in reach.
    s.cooldown = spec.cooldown;
    if (s.kind === 'archer') {
      fireArrow(ctx, e, target);
      return;
    }
    const dx = target.position.x - e.position.x;
    const dz = target.position.z - e.position.z;
    const angle = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - s.facing), Math.cos(Math.atan2(dx, dz) - s.facing)));
    ctx.emit('soldier:strike', { entityId: e.id, kind: s.kind });
    if (Math.hypot(dx, dz) <= spec.attackRange + 0.6 && angle < 0.8 && target.hero) {
      applyDamage(ctx, target.id, spec.damage, e.id, 'light');
    }
    return;
  }
  if (s.cooldown > 0) return;
  const inRange = s.kind === 'archer' ? distance <= spec.attackRange + 2 : distance <= spec.attackRange + 0.4;
  if (!inRange || target.decoy && s.kind !== 'archer' && distance > spec.attackRange) return;
  // Wind up first: the god can see it coming and roll away.
  s.windup = spec.windup;
  ctx.emit('soldier:windup', { entityId: e.id, kind: s.kind, ticks: spec.windup });
}

function fireArrow(ctx: SimContext, e: Entity & { soldier: SoldierState }, target: Entity): void {
  const from = { x: e.position.x, y: e.position.y + 1.5, z: e.position.z };
  const to = { x: target.position.x, y: target.position.y + 1.2, z: target.position.z };
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1;
  const id = spawn(ctx, 'arrow', { position: from, rotationY: Math.atan2(to.x - from.x, to.z - from.z) });
  const arrow = ctx.world.entities[id];
  arrow.region = 'underworld';
  arrow.projectile = {
    vx: ((to.x - from.x) / d) * ARROW_SPEED, vy: ((to.y - from.y) / d) * ARROW_SPEED, vz: ((to.z - from.z) / d) * ARROW_SPEED,
    ticksLeft: ARROW_TICKS, damage: SOLDIER_SPECS.archer.damage, ownerId: e.id,
  };
}

function updateArrow(ctx: SimContext, arrow: Entity): void {
  const p = arrow.projectile!;
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    arrow.position = { x: arrow.position.x + (p.vx * DT) / steps, y: arrow.position.y + (p.vy * DT) / steps, z: arrow.position.z + (p.vz * DT) / steps };
    for (const e of Object.values(ctx.world.entities)) {
      if (!(e.hero || e.decoy) || (e.region ?? 'surface') !== 'underworld') continue;
      const dy = arrow.position.y - (e.position.y + 1);
      if (Math.hypot(e.position.x - arrow.position.x, e.position.z - arrow.position.z) < 0.6 && Math.abs(dy) < 1.1) {
        if (e.hero) applyDamage(ctx, e.id, p.damage, p.ownerId, 'light');
        despawn(ctx, arrow.id);
        return;
      }
    }
  }
  p.ticksLeft -= 1;
  if (p.ticksLeft <= 0 || arrow.position.y < groundAt('underworld', arrow.position.x, arrow.position.z) - 0.2) despawn(ctx, arrow.id);
}

/** Sentries sweep their cone; seeing a god long enough sounds the horn. */
function updateSentry(ctx: SimContext, e: Entity & { soldier: SoldierState }, seeing: boolean): void {
  const s = e.soldier;
  if (s.state === 'attack') {
    // Horn sounded: keep watching the spot; calm down after a while unseen.
    if (s.lastSeen) s.facing = Math.atan2(s.lastSeen.x - e.position.x, s.lastSeen.z - e.position.z);
    e.rotationY = s.facing;
    if (s.timer > ticks(8)) {
      s.state = 'patrol';
      s.awareness = 0;
    }
    return;
  }
  if (!seeing) {
    // A slow ±40° sweep around their post's heading.
    s.scan += 1;
    s.facing = (s.postFacing ?? s.facing) + Math.sin(s.scan / ticks(3)) * 0.7;
    e.rotationY = s.facing;
  } else if (s.lastSeen) {
    s.facing = Math.atan2(s.lastSeen.x - e.position.x, s.lastSeen.z - e.position.z);
    e.rotationY = s.facing;
  }
  if (s.state === 'patrol' && s.awareness >= SUSPICIOUS_AT) {
    s.state = 'suspicious';
    ctx.emit('soldier:suspicious', { entityId: e.id });
  }
  if (s.awareness >= ALERT_AT && s.lastSeen) {
    s.state = 'attack';
    s.timer = 0;
    raiseAlarm(ctx, e, s.lastSeen, HORN_RANGE);
  }
  if (s.state === 'suspicious' && s.awareness <= 0) s.state = 'patrol';
}

function checkFortCleared(ctx: SimContext, fortId: string): void {
  const fort = ctx.world.forts[fortId];
  if (!fort || fort.cleared) return;
  const left = Object.values(ctx.world.entities).some((e) => e.soldier?.fortId === fortId && (e.health?.current ?? 0) > 0);
  if (left) return;
  fort.cleared = true;
  ctx.emit('fort:cleared', { fortId });
}
