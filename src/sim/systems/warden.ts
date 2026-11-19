import { applyDamage, hasStatus, isHittable } from '../combat';
import { DT, ticks } from '../constants';
import type { PhysicsWorld } from '../physics';
import { groundAt, regionOf, type RegionId } from '../regions';
import type { Entity, EntityId, Vec3, WardenAttackKind, WardenState } from '../types';
import { startFreed } from '../cutscenes/freed';
import { startKrakenFreed } from '../cutscenes/kraken-freed';
import { spawn, type SimContext } from '../world';
import { isResting } from './rest';

/**
 * The Warden (SPEC §10, M7): the Mk. II's pilot, a huge armoured man with a
 * maul who climbs out of its rear hatch when it breaks down. Strong and fast:
 * he runs at you faster than a god walks, swings a two-hit maul combo up close,
 * leaps at you from range (a ring shows where he'll land) and dashes in with
 * his shoulder. Every attack has a visible wind-up. Below half health he
 * rages: quicker, shorter warnings. Beat him and Cerberus's chains can be broken.
 */
/** A pilot boss's numbers (the Warden, the Tide Engineer). */
export interface BossSpec {
  health: number;
  body: { radius: number; height: number };
  run: number;
  turn: number;
  swing: { range: number; arcDeg: number; windup: number; recover: number; damage: number; comboCooldown: number };
  leap: { min: number; max: number; windup: number; flight: number; radius: number; damage: number; every: number; height: number };
  dash: { min: number; max: number; windup: number; active: number; speed: number; damage: number; reach: number; every: number };
  rageAt: number;
  rageWindup: number;
  rageSpeed: number;
}

export const WARDEN: BossSpec = {
  // Bigger, tougher and faster (team request, Nov 15): ~4.5 m tall.
  health: 1600,
  body: { radius: 1, height: 4.5 },
  run: 7.6,
  /** Turn rate, rad/s (quick for his size). */
  turn: 6,
  swing: { range: 5.8, arcDeg: 150, windup: ticks(0.55), recover: ticks(0.45), damage: 28, comboCooldown: ticks(0.9) },
  leap: { min: 9, max: 24, windup: ticks(0.8), flight: ticks(0.65), radius: 5, damage: 36, every: ticks(6), height: 7 },
  dash: { min: 6, max: 16, windup: ticks(0.6), active: ticks(0.55), speed: 18, damage: 24, reach: 2.2, every: ticks(4.5) },
  /** Rage below this share of health: attacks wind up this much faster and he runs this much faster. */
  rageAt: 0.5,
  rageWindup: 0.75,
  rageSpeed: 1.2,
};

/**
 * The Tide Engineer (team request, Nov 16): the Kraken mech's pilot, who
 * climbs out of its back hatch when its armour breaks. Same fight as the
 * Warden, but a bit stronger and not as fast: ~25% more health and ~25%
 * harder hits from his anchor, but he runs at 5.4 m/s instead of 7.6 (slower
 * than a sprinting god), turns slower, winds up a little longer and charges
 * slower. Below half health he rages like the Warden.
 */
export const TIDE_ENGINEER: BossSpec = {
  health: 2000,
  body: { radius: 1.05, height: 4.7 },
  run: 5.4,
  turn: 4.2,
  swing: { range: 6, arcDeg: 150, windup: ticks(0.65), recover: ticks(0.5), damage: 35, comboCooldown: ticks(1.1) },
  leap: { min: 9, max: 22, windup: ticks(0.9), flight: ticks(0.75), radius: 5.5, damage: 45, every: ticks(7), height: 6 },
  dash: { min: 6, max: 15, windup: ticks(0.7), active: ticks(0.6), speed: 13, damage: 30, reach: 2.4, every: ticks(5) },
  rageAt: 0.5,
  rageWindup: 0.8,
  rageSpeed: 1.15,
};

/** Which boss this is (by its def), and his numbers. */
export function bossSpec(e: { defId: string }): BossSpec {
  return e.defId === 'tide-engineer' ? TIDE_ENGINEER : WARDEN;
}

/** Ticks between the Warden falling and the reunion scene. */
export const FREED_DELAY = ticks(2.5);

type WardenEntity = Entity & { warden: WardenState; health: NonNullable<Entity['health']> };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Spawns the Warden (the cutscene walks him out of the hatch). */
export function spawnWarden(ctx: SimContext, at: Vec3, rotationY: number): EntityId {
  const id = spawn(ctx, 'the-warden', { position: { ...at }, rotationY });
  Object.assign(ctx.world.entities[id], {
    region: 'underworld',
    health: { current: WARDEN.health, max: WARDEN.health },
    body: { ...WARDEN.body },
    // Hostile, so the companion fights him too; he never wanders (his own system moves him).
    creature: { wanders: false, home: { ...at }, target: null, wait: 0, flee: 0, sinceHit: 0, hostile: true },
    warden: { mode: 'emerging', targetId: null, attack: null, cooldown: ticks(0.5), leapReady: ticks(2), dashReady: ticks(1), combo: 0, enraged: false, walking: false },
  } satisfies Partial<Entity>);
  return id;
}

/** The Warden (the Mk. II's pilot, in the Underworld). */
export function findWarden(world: { entities: Record<EntityId, Entity> }): WardenEntity | undefined {
  return Object.values(world.entities).find((e): e is WardenEntity => !!e.warden && !!e.health && e.defId !== 'tide-engineer');
}

/** The Tide Engineer (the Kraken mech's pilot, in the Ocean). */
export function findTideEngineer(world: { entities: Record<EntityId, Entity> }): WardenEntity | undefined {
  return Object.values(world.entities).find((e): e is WardenEntity => !!e.warden && !!e.health && e.defId === 'tide-engineer');
}

/** Gods he can fight: in his region. */
function targets(ctx: SimContext, region: RegionId): Entity[] {
  return Object.values(ctx.world.entities).filter((e) => e.hero && regionOf(e) === region && isHittable(e) && !isResting(e.hero) && e.hero.down == null);
}

function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Moves him by (dx, dz) on the ground (physics when there is any, so he can't walk through walls). */
function move(e: Entity, dx: number, dz: number, physics?: PhysicsWorld): void {
  const moved = physics?.moveCharacter(e.id, { x: dx, y: -0.3, z: dz });
  const x = moved ? moved.position.x : e.position.x + dx;
  const z = moved ? moved.position.z : e.position.z + dz;
  const ground = groundAt(regionOf(e), x, z);
  e.position = { x, y: moved ? Math.max(moved.position.y, ground) : ground, z };
}

function turnToward(e: Entity, yaw: number): void {
  const step = bossSpec(e).turn * DT;
  e.rotationY = wrap(e.rotationY + Math.max(-step, Math.min(step, wrap(yaw - e.rotationY))));
}

/** Advances the pilot bosses: the Warden and the Tide Engineer (authority only). */
export function updateWarden(ctx: SimContext, physics?: PhysicsWorld): void {
  if (!ctx.isAuthority) return;
  for (const e of Object.values(ctx.world.entities)) {
    if (e.warden && e.health) updateBoss(ctx, e as WardenEntity, physics);
  }
}

function updateBoss(ctx: SimContext, e: WardenEntity, physics?: PhysicsWorld): void {
  const tide = e.defId === 'tide-engineer';
  const S = bossSpec(e);
  const region = regionOf(e);
  if (e.warden.mode === 'emerging') {
    // The Warden's entrance is a cutscene; the Tide Engineer climbs out on his own.
    if (tide) emergeTideEngineer(ctx, e);
    return;
  }
  const w = e.warden;
  w.walking = false;
  if (w.mode === 'defeated') {
    w.fallen = (w.fallen ?? 0) + 1;
    if (w.fallen >= FREED_DELAY && !ctx.world.cutscene) {
      // A moment after he falls: the Warden → the chains break (Hades and Cerberus reunited);
      // the Tide Engineer → Poseidon's kraken goes free (the first time).
      if (!tide && !ctx.world.flags.cerberusFreed) startFreed(ctx, e.id);
      if (tide && !ctx.world.flags.krakenFreed) {
        const mech = Object.values(ctx.world.entities).find((m) => m.kraken);
        if (mech) startKrakenFreed(ctx, mech.id);
      }
    }
    return;
  }
  if (e.health.current <= 0) {
    w.mode = 'defeated';
    w.attack = null;
    w.fallen = 0;
    if (tide) ctx.world.flags.tideEngineerDefeated = true;
    else ctx.world.flags.wardenDefeated = true;
    ctx.emit('warden:defeated', { entityId: e.id });
    return;
  }
  if (!w.enraged && e.health.current <= e.health.max * S.rageAt) {
    w.enraged = true;
    ctx.emit('warden:enraged', { entityId: e.id });
  }
  w.cooldown = Math.max(0, w.cooldown - 1);
  w.leapReady = Math.max(0, w.leapReady - 1);
  w.dashReady = Math.max(0, w.dashReady - 1);
  if (e.creature) e.creature.sinceHit += 1;

  // Held in Hades's Skull Cage: he can't move or attack until it lets go.
  if (hasStatus(e, 'caged')) {
    w.attack = null;
    move(e, 0, 0, physics);
    return;
  }
  if (w.attack) {
    advanceAttack(ctx, e, physics);
    return;
  }
  // Always after the nearest god.
  const gods = targets(ctx, region).sort((a, b) => flat(a.position, e.position) - flat(b.position, e.position) || a.id.localeCompare(b.id));
  const target = gods[0];
  w.targetId = target?.id ?? null;
  if (!target) return;
  const d = flat(target.position, e.position);
  const yaw = Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z);
  turnToward(e, yaw);
  const facing = Math.abs(wrap(yaw - e.rotationY)) < 0.5;
  const windup = (base: number) => Math.round(base * (w.enraged ? S.rageWindup : 1));

  if (w.cooldown === 0 && facing) {
    if (d <= S.swing.range) return startAttack(ctx, e, 'swing', windup(S.swing.windup), S.swing.recover, target.position);
    if (w.leapReady === 0 && d >= S.leap.min && d <= S.leap.max) return startAttack(ctx, e, 'leap', windup(S.leap.windup), S.leap.flight, target.position);
    if (w.dashReady === 0 && d >= S.dash.min && d <= S.dash.max) return startAttack(ctx, e, 'dash', windup(S.dash.windup), S.dash.active, target.position);
  }
  // Run him down (stop just inside maul reach).
  if (d > S.swing.range - 1) {
    const speed = S.run * (w.enraged ? S.rageSpeed : 1);
    const step = Math.min(d - (S.swing.range - 1), speed * DT);
    move(e, Math.sin(e.rotationY) * step, Math.cos(e.rotationY) * step, physics);
    w.walking = true;
  } else {
    move(e, 0, 0, physics);
  }
}

function startAttack(ctx: SimContext, e: WardenEntity, kind: WardenAttackKind, windup: number, active: number, at: Vec3): void {
  const w = e.warden;
  // A leap lands where you are now: the ring shows it, so move.
  const to = kind === 'leap' ? { x: at.x, y: groundAt(regionOf(e), at.x, at.z), z: at.z } : { ...at };
  w.attack = { kind, windup, active, total: active, from: { ...e.position }, to, yaw: e.rotationY, hit: [] };
  ctx.emit('warden:windup', { entityId: e.id, kind, ticks: windup, point: { ...to } });
}

function advanceAttack(ctx: SimContext, e: WardenEntity, physics?: PhysicsWorld): void {
  const w = e.warden;
  const S = bossSpec(e);
  const region = regionOf(e);
  const a = w.attack!;
  if (a.windup > 0) {
    // The maul and the dash track you a little while he winds up; the leap is committed.
    const target = w.targetId ? ctx.world.entities[w.targetId] : undefined;
    if (target && a.kind !== 'leap') {
      turnToward(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z));
      a.yaw = e.rotationY;
    }
    move(e, 0, 0, physics);
    a.windup -= 1;
    if (a.windup === 0) {
      ctx.emit('warden:strike', { entityId: e.id, kind: a.kind });
      if (a.kind === 'swing') swingHits(ctx, e);
    }
    return;
  }
  if (a.kind === 'leap') {
    // An arc from where he crouched to where he aimed.
    const f = 1 - (a.active - 1) / a.total;
    const x = a.from.x + (a.to.x - a.from.x) * f;
    const z = a.from.z + (a.to.z - a.from.z) * f;
    e.position = { x, y: groundAt(region, x, z) + Math.sin(Math.PI * f) * S.leap.height, z };
    e.rotationY = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
    if (a.active === 1) {
      e.position = { ...a.to };
      for (const god of targets(ctx, region)) {
        if (flat(god.position, a.to) <= S.leap.radius) applyDamage(ctx, god.id, S.leap.damage, e.id, 'heavy');
      }
    }
  } else if (a.kind === 'dash') {
    e.rotationY = a.yaw;
    const step = S.dash.speed * DT;
    move(e, Math.sin(a.yaw) * step, Math.cos(a.yaw) * step, physics);
    for (const god of targets(ctx, region)) {
      if (!a.hit.includes(god.id) && flat(god.position, e.position) <= S.dash.reach + (god.body?.radius ?? 0.4)) {
        a.hit.push(god.id);
        applyDamage(ctx, god.id, S.dash.damage, e.id, 'heavy');
      }
    }
  } else {
    move(e, 0, 0, physics);
  }
  a.active -= 1;
  if (a.active > 0) return;
  w.attack = null;
  if (a.kind === 'swing') {
    // A second swing straight after the first, then a breather.
    w.combo += 1;
    if (w.combo >= 2) {
      w.combo = 0;
      w.cooldown = S.swing.comboCooldown;
    }
  } else if (a.kind === 'leap') {
    w.leapReady = S.leap.every;
    w.cooldown = ticks(0.6);
  } else {
    w.dashReady = S.dash.every;
    w.cooldown = ticks(0.5);
  }
}

/** The maul lands: everyone in front of him within reach. */
function swingHits(ctx: SimContext, e: WardenEntity): void {
  const S = bossSpec(e);
  const half = ((S.swing.arcDeg / 2) * Math.PI) / 180;
  for (const god of targets(ctx, regionOf(e))) {
    const d = flat(god.position, e.position) - (god.body?.radius ?? 0.4);
    if (d > S.swing.range) continue;
    const off = Math.abs(wrap(Math.atan2(god.position.x - e.position.x, god.position.z - e.position.z) - e.rotationY));
    if (off <= half) applyDamage(ctx, god.id, S.swing.damage, e.id, 'heavy');
  }
}

/** How long the Tide Engineer takes to climb out of the hatch, drop to the dock and step forward. */
export const TIDE_EMERGE = { climb: ticks(0.8), drop: ticks(0.7), walk: ticks(1.3) } as const;

/**
 * The Kraken mech's back armour has broken: its pilot, the Tide Engineer,
 * climbs out of the open hatch on its back, drops to the dock and comes for
 * you. `mech` is the Kraken mech.
 */
export function spawnTideEngineer(ctx: SimContext, mech: Entity): EntityId {
  const S = TIDE_ENGINEER;
  const region = regionOf(mech);
  const fx = Math.sin(mech.rotationY);
  const fz = Math.cos(mech.rotationY);
  const hatch = { x: mech.position.x - fx * 1.6, y: mech.position.y + 8, z: mech.position.z - fz * 1.6 };
  const landX = mech.position.x + fx * 9;
  const landZ = mech.position.z + fz * 9;
  const land = { x: landX, y: groundAt(region, landX, landZ), z: landZ };
  const id = spawn(ctx, 'tide-engineer', { position: { ...hatch }, rotationY: mech.rotationY });
  Object.assign(ctx.world.entities[id], {
    region,
    health: { current: S.health, max: S.health },
    body: { ...S.body },
    creature: { wanders: false, home: { ...land }, target: null, wait: 0, flee: 0, sinceHit: 0, hostile: true },
    warden: { mode: 'emerging', targetId: null, attack: null, cooldown: ticks(0.8), leapReady: ticks(3), dashReady: ticks(2), combo: 0, enraged: false, walking: false, emerge: { t: 0, from: hatch, to: land } },
  } satisfies Partial<Entity>);
  return id;
}

/** Out of the hatch: crouched on the mech's back, a drop down its side to the dock, then a stride toward the pier. */
function emergeTideEngineer(ctx: SimContext, e: WardenEntity): void {
  const w = e.warden;
  const em = w.emerge;
  if (!em) {
    w.mode = 'fight';
    return;
  }
  em.t += 1;
  const { climb, drop, walk } = TIDE_EMERGE;
  const region = regionOf(e);
  const side = { x: em.from.x + (em.to.x - em.from.x) * 0.45, z: em.from.z + (em.to.z - em.from.z) * 0.45 };
  if (em.t <= climb) {
    e.position = { ...em.from };
  } else if (em.t <= climb + drop) {
    const f = (em.t - climb) / drop;
    const x = em.from.x + (side.x - em.from.x) * f;
    const z = em.from.z + (side.z - em.from.z) * f;
    e.position = { x, y: em.from.y + (groundAt(region, x, z) - em.from.y) * f * f, z };
  } else {
    const f = Math.min(1, (em.t - climb - drop) / walk);
    const x = side.x + (em.to.x - side.x) * f;
    const z = side.z + (em.to.z - side.z) * f;
    e.position = { x, y: groundAt(region, x, z), z };
    w.walking = f < 1;
  }
  if (em.t >= climb + drop + walk) {
    w.mode = 'fight';
    w.walking = false;
    w.emerge = undefined;
    ctx.emit('warden:awake', { entityId: e.id });
  }
}
