import { applyDamage, isHittable } from '../combat';
import { ticks } from '../constants';
import { startWardenScene } from '../cutscenes/warden';
import { GROTTO, groundAt } from '../regions';
import { CERBERUS_POST, MECH_PATROL, MECH_SIZE, MECH_WATCH } from '../terrain/underworld';
import type { Entity, EntityId, MechAttackKind, MechState, Vec3 } from '../types';
import { despawn, spawn, type SimContext } from '../world';
import { isResting } from './rest';

/**
 * Cerberus Mk. II (SPEC §10, cut-down M7): the humans' war machine keeps
 * watch at the Gates. It walks a loop in front of them while its three heads
 * sweep a sensor cone; a god seen in the cone (or right beside it) is spotted.
 * Then it charges at you, and turns — slowly — to fight: a stomp that hits
 * everything around it (a red ring warns first), a fire breath down its sensor
 * cone (the heads glow first), and more charges when you keep your distance. Its only weak spot is the plating on its back, a separate
 * hittable entity. When the plating breaks it powers down and its pilot, the
 * Warden, climbs out to fight (systems/warden.ts); beat him to free Cerberus.
 */
export const MECH = {
  plating: 520,
  walk: 2.2,
  run: 3.4,
  /** Body turn rate, rad/s: slow, so a quick god can get behind it. */
  turn: 0.55,
  /** Sensor cone: length (m) and half-angle (rad), from the heads at the front. */
  sight: 38,
  cone: 0.42,
  /** A god this close to its centre is noticed whichever way it looks (the ground shakes). */
  near: 17,
  alertAt: 60,
  /** Heads sweep ±this around the body's heading while on watch, and can turn ±headLimit while fighting. */
  sweep: 0.75,
  headLimit: 1.1,
  sweepPeriod: 7,
  /** Stops walking at this distance from its target. */
  closeIn: 18,
  /** Never strays further than this from the middle of its watch loop. */
  leash: 48,
  stomp: { radius: 16, windup: ticks(1.5), damage: 32, cooldown: ticks(3) },
  breath: { range: 26, cone: 0.38, windup: ticks(1.3), active: ticks(1.2), every: ticks(0.3), damage: 9, cooldown: ticks(2.5) },
  /**
   * Charge: it lowers its heads (the warning, turning to aim), then thunders
   * straight ahead. Whoever it runs into is hurt and thrown aside; dodge
   * sideways and its back is yours. It charges first whenever you're out of stomp range.
   */
  charge: { windup: ticks(1), active: ticks(2.5), speed: 12, damage: 26, hitWidth: 2.5, overshoot: 10, cooldown: ticks(2), leash: 70 },
  loseTarget: ticks(6),
  search: ticks(6),
} as const;

const TURN_PER_TICK = MECH.turn / 30;

const local = (x: number, z: number): Vec3 => ({ x: GROTTO.center.x + x, y: groundAt('underworld', GROTTO.center.x + x, GROTTO.center.z + z), z: GROTTO.center.z + z });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const forward = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

export type MechEntity = Entity & { mech: MechState };

/** Places the Mk. II on its watch loop, once (when the garrison is placed). */
export function ensureMech(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.mechPlaced) return;
  const start = MECH_PATROL[0];
  const next = MECH_PATROL[1];
  const yaw = Math.atan2(next.x - start.x, next.z - start.z);
  const id = spawn(ctx, 'cerberus-mk2', { position: local(start.x, start.z), rotationY: yaw });
  const mech = world.entities[id];
  mech.region = 'underworld';
  mech.body = { radius: MECH_SIZE.halfX, height: MECH_SIZE.halfY * 2 };
  mech.mech = {
    mode: 'patrol', awareness: 0, targetId: null, lastSeen: null, timer: 0, patrolIndex: 1,
    facing: yaw, scan: 0, attack: null, cooldown: 0, walking: false, platingId: null,
  };
  spawnPlating(ctx, mech as MechEntity);
  ensureChains(ctx);
  world.flags.mechPlaced = true;
}

/** Cerberus's chains (F breaks them once the Warden has fallen). Also added to saves from before they existed. */
export function ensureChains(ctx: SimContext): void {
  if (Object.values(ctx.world.entities).some((e) => e.structure?.kind === 'chains')) return;
  const chains = spawn(ctx, 'cerberus-chains', { position: local(CERBERUS_POST.x + 2.5, CERBERUS_POST.z + 1.5) });
  ctx.world.entities[chains].structure = { kind: 'chains' };
  ctx.world.entities[chains].region = 'underworld';
}

/** Gives the Mk. II fresh rear plating (on placement, and when the level starts over). */
export function spawnPlating(ctx: SimContext, mech: MechEntity): void {
  const platingId = spawn(ctx, 'mech-plating', { position: { ...mech.position }, rotationY: mech.rotationY });
  const plating = ctx.world.entities[platingId];
  Object.assign(plating, {
    region: 'underworld',
    health: { current: MECH.plating, max: MECH.plating },
    body: { radius: 2.4, height: 6 },
    // Hostile, so the companion helps break it; not wandering (it rides on the mech's back).
    creature: { wanders: false, home: { ...mech.position }, target: null, wait: 0, flee: 0, sinceHit: 1, hostile: true },
    mechPart: { mechId: mech.id, part: 'rear-plating' },
  } satisfies Partial<Entity>);
  mech.mech.platingId = platingId;
  placePlating(mech, plating);
}

/** Where the plating sits: on the back of the mech, at ground level so gods can reach it. */
function placePlating(mech: MechEntity, plating: Entity): void {
  const back = forward(mech.rotationY);
  const x = mech.position.x - back.x * (MECH_SIZE.halfZ + 0.4);
  const z = mech.position.z - back.z * (MECH_SIZE.halfZ + 0.4);
  plating.position = { x, y: groundAt('underworld', x, z), z };
  plating.rotationY = mech.rotationY;
}

/** Gods the Mk. II can fight: in the Underworld, standing, not resting. */
function targets(ctx: SimContext): Entity[] {
  return Object.values(ctx.world.entities).filter((e) => e.hero && e.region === 'underworld' && isHittable(e) && !isResting(e.hero) && e.hero.down == null);
}

/** The point its heads see from (the front of the body). */
function eyes(mech: Entity): Vec3 {
  const f = forward(mech.rotationY);
  return { x: mech.position.x + f.x * MECH_SIZE.halfZ, y: mech.position.y, z: mech.position.z + f.z * MECH_SIZE.halfZ };
}

/** Is `target` in the sensor cone (heads' direction `facing`)? */
export function inSensorCone(mech: MechEntity, target: Entity, range: number = MECH.sight, half: number = MECH.cone, yaw: number = mech.mech.facing): boolean {
  const from = eyes(mech);
  const dx = target.position.x - from.x;
  const dz = target.position.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  return Math.abs(wrap(Math.atan2(dx, dz) - yaw)) <= half;
}

/** Can it notice `target` (in the cone, or close enough to feel)? */
function notices(mech: MechEntity, target: Entity): boolean {
  if (inSensorCone(mech, target)) return true;
  return Math.hypot(target.position.x - mech.position.x, target.position.z - mech.position.z) < MECH.near;
}

/** Turns the body toward a heading by at most the turn rate. Returns how far off it still is. */
function turnToward(mech: Entity, yaw: number): number {
  const off = wrap(yaw - mech.rotationY);
  mech.rotationY = wrap(mech.rotationY + Math.max(-TURN_PER_TICK, Math.min(TURN_PER_TICK, off)));
  return Math.abs(wrap(yaw - mech.rotationY));
}

/** Walks forward along its heading (it walks where it faces), staying on its leash. Returns whether it moved. */
function walk(mech: MechEntity, speed: number, leash: number = MECH.leash): boolean {
  const f = forward(mech.rotationY);
  const x = mech.position.x + (f.x * speed) / 30;
  const z = mech.position.z + (f.z * speed) / 30;
  const lx = x - GROTTO.center.x - MECH_WATCH.x;
  const lz = z - GROTTO.center.z - MECH_WATCH.z;
  if (Math.hypot(lx, lz) > leash) {
    mech.mech.walking = false;
    return false;
  }
  mech.position = { x, y: groundAt('underworld', x, z), z };
  mech.mech.walking = true;
  return true;
}

/** Advances the Mk. II (authority only). */
export function updateMech(ctx: SimContext): void {
  if (!ctx.isAuthority || ctx.world.cutscene) return;
  for (const entity of Object.values(ctx.world.entities)) {
    if (entity.mech) updateOne(ctx, entity as MechEntity);
  }
}

function updateOne(ctx: SimContext, e: MechEntity): void {
  const m = e.mech;
  m.walking = false;
  if (m.mode === 'down') return;
  const plating = m.platingId ? ctx.world.entities[m.platingId] : undefined;
  if (!plating || !isHittable(plating)) {
    powerDown(ctx, e, plating);
    return;
  }
  // Hit on the plating this tick (applyDamage zeroes sinceHit): it knows where you are.
  const hitNow = plating.creature?.sinceHit === 0;
  if (plating.creature) plating.creature.sinceHit += 1;

  m.cooldown = Math.max(0, m.cooldown - 1);
  m.timer += 1;
  const gods = targets(ctx);
  const seen = gods.filter((g) => notices(e, g))
    .sort((a, b) => Math.hypot(a.position.x - e.position.x, a.position.z - e.position.z) - Math.hypot(b.position.x - e.position.x, b.position.z - e.position.z));

  if (seen.length > 0) {
    const close = Math.hypot(seen[0].position.x - e.position.x, seen[0].position.z - e.position.z) < 22;
    m.awareness = Math.min(100, m.awareness + (close ? 4 : 2.5));
    m.lastSeen = { ...seen[0].position };
    if (m.mode !== 'attack' || !m.targetId || !seen.some((g) => g.id === m.targetId)) m.targetId = seen[0].id;
  } else if (m.mode !== 'attack') {
    m.awareness = Math.max(0, m.awareness - 0.4);
  }
  if (hitNow && m.mode !== 'attack') {
    // Struck from behind: it knows. The nearest god to the plating is the culprit.
    const culprit = gods.sort((a, b) => Math.hypot(a.position.x - plating.position.x, a.position.z - plating.position.z) - Math.hypot(b.position.x - plating.position.x, b.position.z - plating.position.z))[0];
    if (culprit) {
      m.awareness = 100;
      m.targetId = culprit.id;
      m.lastSeen = { ...culprit.position };
    }
  }
  if (m.mode !== 'attack' && m.awareness >= MECH.alertAt && m.targetId) {
    m.mode = 'attack';
    m.timer = 0;
    // It comes for you straight away.
    m.cooldown = 0;
    ctx.emit('mech:alarm', { entityId: e.id, at: { ...(m.lastSeen ?? e.position) } });
  }

  if (m.mode === 'patrol') patrol(e);
  else if (m.mode === 'search') search(e);
  else fight(ctx, e, seen);

  pushOut(ctx, e);
  placePlating(e, plating);
}

/** Walks the watch loop while the heads sweep left and right. */
function patrol(e: MechEntity): void {
  const m = e.mech;
  const goal = MECH_PATROL[m.patrolIndex % MECH_PATROL.length];
  const gx = GROTTO.center.x + goal.x;
  const gz = GROTTO.center.z + goal.z;
  if (Math.hypot(gx - e.position.x, gz - e.position.z) < 3) m.patrolIndex = (m.patrolIndex + 1) % MECH_PATROL.length;
  const off = turnToward(e, Math.atan2(gx - e.position.x, gz - e.position.z));
  if (off < 0.6) walk(e, MECH.walk);
  m.scan += (Math.PI * 2) / (MECH.sweepPeriod * 30);
  m.facing = wrap(e.rotationY + Math.sin(m.scan) * MECH.sweep);
}

/** Lost the target: stands and looks around faster, then goes back on watch. */
function search(e: MechEntity): void {
  const m = e.mech;
  m.scan += (Math.PI * 2) / (3.5 * 30);
  m.facing = wrap(e.rotationY + Math.sin(m.scan) * MECH.headLimit);
  m.awareness = Math.max(0, m.awareness - 0.4);
  if (m.timer > MECH.search) {
    m.mode = 'patrol';
    m.timer = 0;
    m.targetId = null;
  }
}

function fight(ctx: SimContext, e: MechEntity, seen: Entity[]): void {
  const m = e.mech;
  if (m.attack) {
    advanceAttack(ctx, e);
    return;
  }
  const target = m.targetId ? ctx.world.entities[m.targetId] : undefined;
  if (target && seen.some((g) => g.id === target.id)) m.timer = 0;
  if (!target || !isHittable(target) || m.timer > MECH.loseTarget) {
    m.mode = 'search';
    m.timer = 0;
    return;
  }
  // Aim at where the target was last seen; the heads lead, the body follows slowly.
  const aim = m.lastSeen ?? target.position;
  const yaw = Math.atan2(aim.x - e.position.x, aim.z - e.position.z);
  const off = turnToward(e, yaw);
  m.facing = wrap(e.rotationY + Math.max(-MECH.headLimit, Math.min(MECH.headLimit, wrap(yaw - e.rotationY))));
  const d = Math.hypot(target.position.x - e.position.x, target.position.z - e.position.z);
  if (m.cooldown === 0) {
    if (d < MECH.stomp.radius) {
      startAttack(ctx, e, 'stomp', MECH.stomp.windup, 1);
      return;
    }
    // Far off: charge (it aims during the warning). In breath range and in its cone after a charge: breathe fire.
    const breathOk = d < MECH.breath.range && inSensorCone(e, target, MECH.breath.range, MECH.breath.cone + 0.1);
    if (breathOk && m.lastAttack === 'charge') {
      startAttack(ctx, e, 'breath', MECH.breath.windup, MECH.breath.active);
      return;
    }
    if (off < 1.2) {
      startAttack(ctx, e, 'charge', MECH.charge.windup, MECH.charge.active);
      return;
    }
    if (breathOk) {
      startAttack(ctx, e, 'breath', MECH.breath.windup, MECH.breath.active);
      return;
    }
  }
  if (d > MECH.closeIn && off < 0.5) walk(e, MECH.run);
}

function startAttack(ctx: SimContext, e: MechEntity, kind: MechAttackKind, windup: number, active: number): void {
  const m = e.mech;
  m.attack = { kind, windup, active, point: { ...e.position }, yaw: kind === 'charge' ? e.rotationY : m.facing, hit: [] };
  m.lastAttack = kind;
  ctx.emit('mech:windup', { entityId: e.id, kind, ticks: windup, point: { ...e.position }, yaw: m.facing });
}

function advanceAttack(ctx: SimContext, e: MechEntity): void {
  const m = e.mech;
  const attack = m.attack!;
  if (attack.kind === 'charge') {
    advanceCharge(ctx, e, attack);
    return;
  }
  if (attack.windup > 0) {
    attack.windup -= 1;
    if (attack.windup === 0) ctx.emit('mech:strike', { entityId: e.id, kind: attack.kind });
    else return;
  }
  if (attack.kind === 'stomp') {
    for (const god of targets(ctx)) {
      if (Math.hypot(god.position.x - attack.point.x, god.position.z - attack.point.z) <= MECH.stomp.radius) {
        applyDamage(ctx, god.id, MECH.stomp.damage, e.id, 'heavy');
      }
    }
    m.attack = null;
    m.cooldown = MECH.stomp.cooldown;
    return;
  }
  // Breath: burns everyone in the cone, a few times over its length.
  const elapsed = MECH.breath.active - attack.active;
  if (elapsed % MECH.breath.every === 0) {
    for (const god of targets(ctx)) {
      if (inSensorCone(e, god, MECH.breath.range, MECH.breath.cone, attack.yaw)) applyDamage(ctx, god.id, MECH.breath.damage, e.id, 'ability');
    }
  }
  attack.active -= 1;
  if (attack.active <= 0) {
    m.attack = null;
    m.cooldown = MECH.breath.cooldown;
  }
}

/** The charge: aim during the warning, then run straight, trampling whoever is in the way. */
function advanceCharge(ctx: SimContext, e: MechEntity, attack: NonNullable<MechState['attack']>): void {
  const m = e.mech;
  const target = m.targetId ? ctx.world.entities[m.targetId] : undefined;
  if (attack.windup > 0) {
    // Lowering its heads, turning to aim at you.
    if (target) {
      turnToward(e, Math.atan2(target.position.x - e.position.x, target.position.z - e.position.z));
      m.facing = e.rotationY;
    }
    attack.windup -= 1;
    if (attack.windup === 0) {
      attack.yaw = e.rotationY;
      // It means to run through you and a little past.
      const d = target ? Math.hypot(target.position.x - e.position.x, target.position.z - e.position.z) : 20;
      attack.active = Math.min(MECH.charge.active, Math.ceil(((d + MECH.charge.overshoot) / MECH.charge.speed) * 30));
      ctx.emit('mech:strike', { entityId: e.id, kind: 'charge' });
    }
    return;
  }
  e.rotationY = attack.yaw;
  m.facing = attack.yaw;
  const moved = walk(e, MECH.charge.speed, MECH.charge.leash);
  // Trample: anyone ahead of its chest and within its width.
  const f = forward(e.rotationY);
  for (const god of targets(ctx)) {
    if (attack.hit?.includes(god.id)) continue;
    const dx = god.position.x - e.position.x;
    const dz = god.position.z - e.position.z;
    const along = dx * f.x + dz * f.z;
    const across = Math.abs(dx * f.z - dz * f.x);
    if (along > -MECH_SIZE.halfZ && along < MECH_SIZE.halfZ + 2 && across < MECH_SIZE.halfX + MECH.charge.hitWidth) {
      (attack.hit ??= []).push(god.id);
      applyDamage(ctx, god.id, MECH.charge.damage, e.id, 'heavy');
    }
  }
  attack.active -= 1;
  if (attack.active <= 0 || !moved) {
    m.attack = null;
    m.cooldown = MECH.charge.cooldown;
  }
}

/** Gods it walks into are shoved out of its footprint (it's far too heavy to stop). */
function pushOut(ctx: SimContext, e: MechEntity): void {
  const f = forward(e.rotationY);
  const r = { x: f.z, z: -f.x };
  for (const god of Object.values(ctx.world.entities)) {
    if (!god.hero || god.region !== 'underworld') continue;
    const dx = god.position.x - e.position.x;
    const dz = god.position.z - e.position.z;
    const along = dx * f.x + dz * f.z;
    const across = dx * r.x + dz * r.z;
    const hx = MECH_SIZE.halfX + 0.6;
    const hz = MECH_SIZE.halfZ + 0.6;
    if (Math.abs(along) >= hz || Math.abs(across) >= hx) continue;
    // Out through the nearest side.
    const sideGap = hx - Math.abs(across);
    const endGap = hz - Math.abs(along);
    const push = sideGap < endGap
      ? { x: r.x * Math.sign(across || 1) * sideGap, z: r.z * Math.sign(across || 1) * sideGap }
      : { x: f.x * Math.sign(along || 1) * endGap, z: f.z * Math.sign(along || 1) * endGap };
    const x = god.position.x + push.x;
    const z = god.position.z + push.z;
    god.position = { x, y: groundAt('underworld', x, z), z };
  }
}

/** The plating broke: the Mk. II powers down and its pilot, the Warden, climbs out. */
function powerDown(ctx: SimContext, e: MechEntity, plating: Entity | undefined): void {
  const m = e.mech;
  m.mode = 'down';
  m.attack = null;
  m.targetId = null;
  m.walking = false;
  if (plating) despawn(ctx, plating.id);
  m.platingId = null;
  ctx.emit('mech:down', { entityId: e.id });
  startWardenScene(ctx, e.id);
}

/** For tests and the dev menu: the mech entity, if placed. */
export function findMech(world: { entities: Record<EntityId, Entity> }): MechEntity | undefined {
  return Object.values(world.entities).find((e): e is MechEntity => !!e.mech);
}
