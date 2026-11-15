import { applyDamage, isHittable } from '../combat';
import { DT, ticks } from '../constants';
import type { PhysicsWorld } from '../physics';
import { groundAt } from '../regions';
import type { Entity, EntityId, Vec3, WardenAttackKind, WardenState } from '../types';
import { startFreed } from '../cutscenes/freed';
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
export const WARDEN = {
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
} as const;

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

export function findWarden(world: { entities: Record<EntityId, Entity> }): WardenEntity | undefined {
  return Object.values(world.entities).find((e): e is WardenEntity => !!e.warden && !!e.health);
}

/** Gods he can fight. */
function targets(ctx: SimContext): Entity[] {
  return Object.values(ctx.world.entities).filter((e) => e.hero && e.region === 'underworld' && isHittable(e) && !isResting(e.hero) && e.hero.down == null);
}

function flat(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Moves him by (dx, dz) on the ground (physics when there is any, so he can't walk through walls). */
function move(e: Entity, dx: number, dz: number, physics?: PhysicsWorld): void {
  const moved = physics?.moveCharacter(e.id, { x: dx, y: -0.3, z: dz });
  const x = moved ? moved.position.x : e.position.x + dx;
  const z = moved ? moved.position.z : e.position.z + dz;
  const ground = groundAt('underworld', x, z);
  e.position = { x, y: moved ? Math.max(moved.position.y, ground) : ground, z };
}

function turnToward(e: Entity, yaw: number): void {
  const step = WARDEN.turn * DT;
  e.rotationY = wrap(e.rotationY + Math.max(-step, Math.min(step, wrap(yaw - e.rotationY))));
}

/** Advances the Warden (authority only). */
export function updateWarden(ctx: SimContext, physics?: PhysicsWorld): void {
  if (!ctx.isAuthority) return;
  const e = findWarden(ctx.world);
  if (!e || e.warden.mode === 'emerging') return;
  const w = e.warden;
  w.walking = false;
  if (w.mode === 'defeated') {
    // A moment after he falls, the chains break: Hades and Cerberus are reunited (and Poseidon arrives).
    w.fallen = (w.fallen ?? 0) + 1;
    if (w.fallen >= FREED_DELAY && !ctx.world.flags.cerberusFreed && !ctx.world.cutscene) startFreed(ctx, e.id);
    return;
  }
  if (e.health.current <= 0) {
    w.mode = 'defeated';
    w.attack = null;
    w.fallen = 0;
    ctx.world.flags.wardenDefeated = true;
    ctx.emit('warden:defeated', { entityId: e.id });
    return;
  }
  if (!w.enraged && e.health.current <= e.health.max * WARDEN.rageAt) {
    w.enraged = true;
    ctx.emit('warden:enraged', { entityId: e.id });
  }
  w.cooldown = Math.max(0, w.cooldown - 1);
  w.leapReady = Math.max(0, w.leapReady - 1);
  w.dashReady = Math.max(0, w.dashReady - 1);
  if (e.creature) e.creature.sinceHit += 1;

  if (w.attack) {
    advanceAttack(ctx, e, physics);
    return;
  }
  // Always after the nearest god.
  const gods = targets(ctx).sort((a, b) => flat(a.position, e.position) - flat(b.position, e.position) || a.id.localeCompare(b.id));
  const target = gods[0];
  w.targetId = target?.id ?? null;
  if (!target) return;
  const d = flat(target.position, e.position);
  const yaw = Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z);
  turnToward(e, yaw);
  const facing = Math.abs(wrap(yaw - e.rotationY)) < 0.5;
  const windup = (base: number) => Math.round(base * (w.enraged ? WARDEN.rageWindup : 1));

  if (w.cooldown === 0 && facing) {
    if (d <= WARDEN.swing.range) return startAttack(ctx, e, 'swing', windup(WARDEN.swing.windup), WARDEN.swing.recover, target.position);
    if (w.leapReady === 0 && d >= WARDEN.leap.min && d <= WARDEN.leap.max) return startAttack(ctx, e, 'leap', windup(WARDEN.leap.windup), WARDEN.leap.flight, target.position);
    if (w.dashReady === 0 && d >= WARDEN.dash.min && d <= WARDEN.dash.max) return startAttack(ctx, e, 'dash', windup(WARDEN.dash.windup), WARDEN.dash.active, target.position);
  }
  // Run him down (stop just inside maul reach).
  if (d > WARDEN.swing.range - 1) {
    const speed = WARDEN.run * (w.enraged ? WARDEN.rageSpeed : 1);
    const step = Math.min(d - (WARDEN.swing.range - 1), speed * DT);
    move(e, Math.sin(e.rotationY) * step, Math.cos(e.rotationY) * step, physics);
    w.walking = true;
  } else {
    move(e, 0, 0, physics);
  }
}

function startAttack(ctx: SimContext, e: WardenEntity, kind: WardenAttackKind, windup: number, active: number, at: Vec3): void {
  const w = e.warden;
  // A leap lands where you are now: the ring shows it, so move.
  const to = kind === 'leap' ? { x: at.x, y: groundAt('underworld', at.x, at.z), z: at.z } : { ...at };
  w.attack = { kind, windup, active, total: active, from: { ...e.position }, to, yaw: e.rotationY, hit: [] };
  ctx.emit('warden:windup', { entityId: e.id, kind, ticks: windup, point: { ...to } });
}

function advanceAttack(ctx: SimContext, e: WardenEntity, physics?: PhysicsWorld): void {
  const w = e.warden;
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
    e.position = { x, y: groundAt('underworld', x, z) + Math.sin(Math.PI * f) * WARDEN.leap.height, z };
    e.rotationY = Math.atan2(a.to.x - a.from.x, a.to.z - a.from.z);
    if (a.active === 1) {
      e.position = { ...a.to };
      for (const god of targets(ctx)) {
        if (flat(god.position, a.to) <= WARDEN.leap.radius) applyDamage(ctx, god.id, WARDEN.leap.damage, e.id, 'heavy');
      }
    }
  } else if (a.kind === 'dash') {
    e.rotationY = a.yaw;
    const step = WARDEN.dash.speed * DT;
    move(e, Math.sin(a.yaw) * step, Math.cos(a.yaw) * step, physics);
    for (const god of targets(ctx)) {
      if (!a.hit.includes(god.id) && flat(god.position, e.position) <= WARDEN.dash.reach + (god.body?.radius ?? 0.4)) {
        a.hit.push(god.id);
        applyDamage(ctx, god.id, WARDEN.dash.damage, e.id, 'heavy');
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
      w.cooldown = WARDEN.swing.comboCooldown;
    }
  } else if (a.kind === 'leap') {
    w.leapReady = WARDEN.leap.every;
    w.cooldown = ticks(0.6);
  } else {
    w.dashReady = WARDEN.dash.every;
    w.cooldown = ticks(0.5);
  }
}

/** The maul lands: everyone in front of him within reach. */
function swingHits(ctx: SimContext, e: WardenEntity): void {
  const half = ((WARDEN.swing.arcDeg / 2) * Math.PI) / 180;
  for (const god of targets(ctx)) {
    const d = flat(god.position, e.position) - (god.body?.radius ?? 0.4);
    if (d > WARDEN.swing.range) continue;
    const off = Math.abs(wrap(Math.atan2(god.position.x - e.position.x, god.position.z - e.position.z) - e.rotationY));
    if (off <= half) applyDamage(ctx, god.id, WARDEN.swing.damage, e.id, 'heavy');
  }
}
