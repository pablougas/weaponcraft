import { applyDamage, isHittable } from '../combat';
import { DT, ticks } from '../constants';
import type { PhysicsWorld } from '../physics';
import { GROTTO, groundAt } from '../regions';
import { FORT_RADIUS, FORT_SPOTS, pathX, SPIRES, underworldClamp } from '../terrain/underworld';
import type { Entity, EntityId, SoldierKind, SoldierState, Vec3 } from '../types';
import { despawn, spawn, type SimContext } from '../world';
import { isResting } from './rest';

/**
 * The humans in the Underworld (SPEC §9, M6): soldiers in small forts and
 * sentry squads patrolling the fields. Soldiers patrol → grow suspicious →
 * raise the alarm → attack → search → return.
 *
 * Sentry squads (team request, Nov 15): 3–4 sentries walk a route together in
 * a V behind their leader. Three squads are led by a Sentry Captain: bigger,
 * armoured, slow heavy halberd slams; while he lives his squad hits harder,
 * and when he falls the rest break and run. Only the leader watches with a
 * sight cone (the one drawn on the ground); followers notice you only up
 * close or when hit, so the visible cone is always the squad's real sight.
 * The first sentry to see you sounds the horn, then the squad attacks.
 * Everything here is deterministic sim logic.
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
  sentry: { maxHealth: 40, body: { radius: 0.34, height: 1.8 }, walk: 1.5, run: 3.6, sight: 22, cone: 0.7, notice: 1.5, attackRange: 1.9, windup: ticks(0.5), cooldown: ticks(1.5), damage: 7 },
  captain: { maxHealth: 180, body: { radius: 0.48, height: 2.2 }, walk: 1.5, run: 3.0, sight: 20, cone: 0.85, notice: 1.3, attackRange: 2.6, windup: ticks(0.9), cooldown: ticks(2.2), damage: 22 },
};

/** A captain's halberd slam hits everything in front of him within this half-angle. */
const CAPTAIN_SLAM_ARC = 1.2;
/** While their captain lives, a squad's sentries hit this much harder. */
const CAPTAIN_RALLY = 1.25;
/** When the captain falls, the squad runs for this long before regrouping. */
const ROUT_TICKS = ticks(6);

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
/** Waypoints (grotto-local) along the main path between z0 and z1, offset sideways by `dx`, there and back. */
const alongPath = (z0: number, z1: number, dx: number, steps = 4): Array<{ x: number; z: number }> => {
  const out: Array<{ x: number; z: number }> = [];
  for (let i = 0; i <= steps; i += 1) {
    const z = z0 + ((z1 - z0) * i) / steps;
    out.push({ x: pathX(z) + dx, z });
  }
  for (let i = steps - 1; i >= 1; i -= 1) out.push({ x: out[i].x - dx * 2, z: out[i].z });
  return out;
};
/** A loop round a fort, outside its palisade. */
const aroundFort = (fort: { x: number; z: number }, radius: number, steps = 8): Array<{ x: number; z: number }> =>
  Array.from({ length: steps }, (_, i) => ({ x: fort.x + Math.cos((i / steps) * Math.PI * 2) * radius, z: fort.z + Math.sin((i / steps) * Math.PI * 2) * radius }));

/**
 * Six sentry squads on the fields (team request, Nov 15): three led by a
 * captain (captain + 3 sentries), three of 3 sentries. Routes follow the main
 * path or loop round the first two forts.
 */
export const SENTRY_SQUADS: ReadonlyArray<{ id: string; captain: boolean; sentries: number; route: ReadonlyArray<{ x: number; z: number }> }> = [
  { id: 'squad-approach', captain: false, sentries: 3, route: alongPath(-95, -165, 5) },
  { id: 'squad-river', captain: true, sentries: 3, route: alongPath(-210, -300, -4) },
  { id: 'squad-asphodel-ring', captain: false, sentries: 3, route: aroundFort(FORT_SPOTS[0], FORT_RADIUS + 5, 10) },
  { id: 'squad-styx-ring', captain: false, sentries: 3, route: aroundFort(FORT_SPOTS[1], FORT_RADIUS + 5, 10) },
  { id: 'squad-midfield', captain: true, sentries: 3, route: alongPath(-370, -445, 5) },
  { id: 'squad-gates', captain: true, sentries: 3, route: alongPath(-505, -560, -5) },
];
/** Where followers walk relative to their leader: x to the leader's right, z ahead (negative = behind). */
const FORMATION: ReadonlyArray<{ x: number; z: number }> = [
  { x: 0, z: 0 },
  { x: -1.8, z: -2 },
  { x: 1.8, z: -2 },
  { x: 0, z: -3.8 },
];

const local = (x: number, z: number): Vec3 => ({ x: GROTTO.center.x + x, y: groundAt('underworld', GROTTO.center.x + x, GROTTO.center.z + z), z: GROTTO.center.z + z });

/** Places the forts' soldiers and the sentry squads, once (when the Underworld opens up). */
export function ensureGarrison(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.garrisonPlaced) {
    // Saves from before the squads: swap the old lone sentries for squads.
    if (!world.flags.squadsPlaced) {
      for (const e of Object.values(world.entities)) if (e.soldier?.kind === 'sentry' && !e.soldier.squadId) despawn(ctx, e.id);
      placeSquads(ctx);
    }
    return;
  }
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
  placeSquads(ctx);
  world.flags.garrisonPlaced = true;
}

function placeSquads(ctx: SimContext): void {
  for (const squad of SENTRY_SQUADS) {
    const route = squad.route.map((p) => local(p.x, p.z));
    const start = route[0];
    const next = route[1] ?? route[0];
    const heading = Math.atan2(next.x - start.x, next.z - start.z);
    const kinds: SoldierKind[] = [...(squad.captain ? ['captain' as const] : []), ...Array.from({ length: squad.sentries }, () => 'sentry' as const)];
    kinds.forEach((kind, slot) => {
      const offset = FORMATION[slot % FORMATION.length];
      const x = start.x + Math.cos(heading) * offset.x + Math.sin(heading) * offset.z;
      const z = start.z - Math.sin(heading) * offset.x + Math.cos(heading) * offset.z;
      const id = spawnSoldier(ctx, kind, { x, y: groundAt('underworld', x, z), z }, heading, null, route);
      Object.assign(ctx.world.entities[id].soldier!, { squadId: squad.id, slot, leader: slot === 0 });
    });
  }
  ctx.world.flags.squadsPlaced = true;
}

/** Living members of a squad, leader first: the captain if alive, else the lowest slot. */
function squadMembers(ctx: SimContext, squadId: string): Array<Entity & { soldier: SoldierState }> {
  return (Object.values(ctx.world.entities).filter((e) => e.soldier?.squadId === squadId && (e.health?.current ?? 0) > 0) as Array<Entity & { soldier: SoldierState }>)
    .sort((a, b) => (a.soldier.kind === 'captain' ? 0 : 1) - (b.soldier.kind === 'captain' ? 0 : 1) || (a.soldier.slot ?? 0) - (b.soldier.slot ?? 0) || a.id.localeCompare(b.id));
}

/** Marks each squad's leader and hands the route position on when a leader falls. */
function updateSquadLeaders(ctx: SimContext): void {
  for (const squad of SENTRY_SQUADS) {
    const members = squadMembers(ctx, squad.id);
    members.forEach((m, i) => {
      if (i === 0 && !m.soldier.leader) {
        // New leader: carry on from where the old one was heading.
        const old = Object.values(ctx.world.entities).find((e) => e.soldier?.squadId === squad.id && e.soldier.leader && e.id !== m.id);
        if (old?.soldier) m.soldier.patrolIndex = old.soldier.patrolIndex;
      }
      m.soldier.leader = i === 0;
    });
  }
}

/** The captain fell: everyone left in his squad breaks and runs. */
function rout(ctx: SimContext, captain: Entity & { soldier: SoldierState }): void {
  const squadId = captain.soldier.squadId;
  if (!squadId) return;
  for (const m of squadMembers(ctx, squadId)) {
    if (m.id === captain.id) continue;
    m.soldier.state = 'flee';
    m.soldier.timer = 0;
    m.soldier.windup = 0;
  }
  ctx.emit('soldier:rout', { squadId, captainId: captain.id });
}

function spawnSoldier(ctx: SimContext, kind: SoldierKind, home: Vec3, facing: number, fortId: string | null, patrol: Vec3[]): EntityId {
  const spec = SOLDIER_SPECS[kind];
  const defId = kind === 'sentry' ? 'sentry' : kind === 'captain' ? 'sentry-captain' : `soldier-${kind}`;
  const id = spawn(ctx, defId, { position: { ...home }, rotationY: facing });
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
  // In a squad only the leader watches (its cone is the one drawn); the others notice you up close.
  if (soldier.soldier.squadId && !soldier.soldier.leader && d > HEAR_RANGE) return false;
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
    if (!other.soldier || other.id === from.id || other.soldier.state === 'flee') continue;
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
  if (moved) {
    entity.position = moved.position;
    // Never below the ground (a body that ends up under the one-sided heightfield would sink forever).
    const ground = groundAt('underworld', moved.position.x, moved.position.z);
    if (entity.position.y < ground - 0.3) entity.position = { ...entity.position, y: ground };
  } else {
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
  updateSquadLeaders(ctx);
  for (const entity of Object.values(world.entities)) {
    if (entity.projectile) {
      updateArrow(ctx, entity);
      continue;
    }
    if (!entity.soldier || !entity.health) continue;
    if (entity.health.current <= 0) {
      const fortId = entity.soldier.fortId;
      if (entity.soldier.kind === 'captain') rout(ctx, entity as Entity & { soldier: SoldierState });
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

  if (s.state === 'flee') {
    updateFlee(ctx, e, targets, physics);
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
    // A sentry sounds the horn (it carries far); everyone else shouts.
    raiseAlarm(ctx, e, s.lastSeen, s.kind === 'sentry' ? HORN_RANGE : SHOUT_RANGE);
  }
  if (s.state === 'suspicious' && s.awareness <= 0) s.state = 'return';
  if (s.state === 'attack' && s.timer > LOSE_TARGET_TICKS) {
    s.state = 'search';
    s.timer = 0;
    s.windup = 0;
  }

  switch (s.state) {
    case 'patrol': {
      if (s.squadId && !s.leader) {
        followLeader(ctx, e, physics);
        return;
      }
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
      if (s.squadId && !s.leader) {
        // Fall back into formation; once there, carry on patrolling.
        if (followLeader(ctx, e, physics) < 1.2) {
          s.state = 'patrol';
          s.awareness = 0;
          s.targetId = null;
        }
        return;
      }
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
    if (s.kind === 'captain') {
      // Halberd slam: everything in front of him, not just the target.
      for (const other of Object.values(ctx.world.entities)) {
        if (!other.hero || !isHittable(other) || (other.region ?? 'surface') !== 'underworld') continue;
        const ox = other.position.x - e.position.x;
        const oz = other.position.z - e.position.z;
        const off = Math.abs(Math.atan2(Math.sin(Math.atan2(ox, oz) - s.facing), Math.cos(Math.atan2(ox, oz) - s.facing)));
        if (Math.hypot(ox, oz) <= spec.attackRange + 0.8 && off < CAPTAIN_SLAM_ARC) applyDamage(ctx, other.id, spec.damage, e.id, 'heavy');
      }
      return;
    }
    if (Math.hypot(dx, dz) <= spec.attackRange + 0.6 && angle < 0.8 && target.hero) {
      applyDamage(ctx, target.id, spec.damage * rally(ctx, e), e.id, 'light');
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

/** A squad's sentries hit harder while their captain is alive. */
function rally(ctx: SimContext, e: Entity & { soldier: SoldierState }): number {
  const squadId = e.soldier.squadId;
  if (!squadId || e.soldier.kind === 'captain') return 1;
  return squadMembers(ctx, squadId).some((m) => m.soldier.kind === 'captain') ? CAPTAIN_RALLY : 1;
}

/** Walks to this follower's place in the V behind its leader. Returns the distance to it. */
function followLeader(ctx: SimContext, e: Entity & { soldier: SoldierState }, physics?: PhysicsWorld): number {
  const leader = squadMembers(ctx, e.soldier.squadId!)[0];
  if (!leader || leader.id === e.id) return 0;
  const members = squadMembers(ctx, e.soldier.squadId!);
  const slot = Math.max(1, members.findIndex((m) => m.id === e.id));
  const offset = FORMATION[slot % FORMATION.length];
  const h = leader.soldier.facing;
  const goal = {
    x: leader.position.x + Math.cos(h) * offset.x + Math.sin(h) * offset.z,
    y: leader.position.y,
    z: leader.position.z - Math.sin(h) * offset.x + Math.cos(h) * offset.z,
  };
  const d = Math.hypot(goal.x - e.position.x, goal.z - e.position.z);
  // Hurry to catch up; once in place, match the leader's pace and heading.
  const speed = d > 2.5 ? SOLDIER_SPECS[e.soldier.kind].run * 0.7 : SOLDIER_SPECS[e.soldier.kind].walk * 1.15;
  const before = { x: e.position.x, z: e.position.z };
  const creature = e.creature!;
  // Caught on a spire or a ledge: try going round it via the leader's own spot first.
  const target = (creature.blocked ?? 0) > ticks(1) ? leader.position : goal;
  walkToward(e, target, speed, 0.25, physics);
  if (d < 0.6) {
    e.soldier.facing = h;
    e.rotationY = h;
  }
  const moved = Math.hypot(e.position.x - before.x, e.position.z - before.z);
  creature.blocked = d > 4 && moved < speed * DT * 0.3 ? (creature.blocked ?? 0) + 1 : 0;
  // Still stuck after a few seconds and no god nearby to see it: rejoin the formation.
  if ((creature.blocked ?? 0) > ticks(3) && !nearAGod(ctx, e, 30)) {
    e.position = { x: goal.x, y: groundAt('underworld', goal.x, goal.z), z: goal.z };
    creature.blocked = 0;
  }
  return d;
}

function nearAGod(ctx: SimContext, e: Entity, range: number): boolean {
  return Object.values(ctx.world.entities).some((g) => g.hero && (g.region ?? 'surface') === 'underworld'
    && Math.hypot(g.position.x - e.position.x, g.position.z - e.position.z) < range);
}

/** Routed: run from the nearest god for a few seconds, then regroup. */
function updateFlee(ctx: SimContext, e: Entity & { soldier: SoldierState }, targets: Entity[], physics?: PhysicsWorld): void {
  const s = e.soldier;
  s.timer += 1;
  s.windup = 0;
  const threat = targets
    .map((t) => ({ t, d: Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z) }))
    .sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id))[0]?.t;
  const from = threat?.position ?? s.lastSeen ?? e.creature!.home;
  const dx = e.position.x - from.x;
  const dz = e.position.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  const away = underworldClamp(e.position.x - GROTTO.center.x + (dx / len) * 8, e.position.z - GROTTO.center.z + (dz / len) * 8, 2);
  walkToward(e, local(away.x, away.z), SOLDIER_SPECS[s.kind].run * 1.1, 0, physics);
  if (s.timer >= ROUT_TICKS) {
    s.state = 'return';
    s.awareness = 0;
    s.targetId = null;
    s.timer = 0;
  }
}

function checkFortCleared(ctx: SimContext, fortId: string): void {
  const fort = ctx.world.forts[fortId];
  if (!fort || fort.cleared) return;
  const left = Object.values(ctx.world.entities).some((e) => e.soldier?.fortId === fortId && (e.health?.current ?? 0) > 0);
  if (left) return;
  fort.cleared = true;
  ctx.emit('fort:cleared', { fortId });
}
