import { ticks } from '../constants';
import { groundAt, regionOf } from '../regions';
import type { Entity, EntityId, HeroState, Vec3 } from '../types';
import type { SimContext } from '../world';
import { RESET_FADE, restartEncounters, wakeAtBed } from './restart';

/**
 * Resting at a bed (SPEC §6) and falling in battle. Both are short sim
 * timelines the view draws (lie down, fade out, fade in, get up). A god who
 * falls wakes at the Refuge bed, healed.
 */
export const REST = {
  /** Lie down on the bed. */
  lie: ticks(1),
  /** Fade to black. */
  fadeOut: ticks(1),
  /** Black: health and stamina are restored here. */
  dark: ticks(0.6),
  /** Fade back in, still lying. */
  fadeIn: ticks(1),
  /** Get up and step off the bed. */
  rise: ticks(0.9),
} as const;
export const REST_HEAL_TICK = REST.lie + REST.fadeOut;
export const REST_TOTAL = REST.lie + REST.fadeOut + REST.dark + REST.fadeIn + REST.rise;
/** Falling in battle: collapse, then fade out before waking at the bed. */
export const DOWN = { fall: ticks(0.8), fadeOut: ticks(1.2), total: ticks(2.2) } as const;
/** A companion stays down this long, then gets up near the god you're controlling. */
export const COMPANION_DOWN_TICKS = ticks(10);

/** How far lying down (0 standing → 1 lying) and how dark (0–1) a hero is, for the view. */
export function restPose(hero: HeroState | undefined): { lay: number; fade: number; onBed: boolean } {
  const ease = (x: number) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * (3 - 2 * t);
  };
  if (hero?.resetting != null) {
    // "Reset level": a calm fade to black where the god stands.
    return { lay: 0, fade: ease(hero.resetting / RESET_FADE), onBed: false };
  }
  if (hero?.down != null) {
    const t = hero.down;
    return { lay: ease(t / DOWN.fall), fade: ease((t - (DOWN.total - DOWN.fadeOut)) / DOWN.fadeOut), onBed: false };
  }
  if (hero?.rest) {
    const t = hero.rest.t;
    const riseAt = REST_TOTAL - REST.rise;
    const lay = t < riseAt ? ease(t / REST.lie) : 1 - ease((t - riseAt) / REST.rise);
    const fade = t < REST.lie ? 0
      : t < REST_HEAL_TICK ? ease((t - REST.lie) / REST.fadeOut)
        : t < REST_HEAL_TICK + REST.dark ? 1
          : 1 - ease((t - REST_HEAL_TICK - REST.dark) / REST.fadeIn);
    return { lay, fade, onBed: true };
  }
  return { lay: 0, fade: 0, onBed: false };
}

/** Where a god stands beside a bed (its right-hand side). */
export function bedSide(bed: Entity): Vec3 {
  const sx = Math.cos(bed.rotationY) * 1.7;
  const sz = -Math.sin(bed.rotationY) * 1.7;
  const x = bed.position.x + sx;
  const z = bed.position.z + sz;
  return { x, y: groundAt(regionOf(bed), x, z), z };
}

/** The bed a fallen god wakes at: one in their region if there is one, else any. */
export function respawnBed(ctx: SimContext, entity: Entity): Entity | undefined {
  const beds = Object.values(ctx.world.entities).filter((e) => e.structure?.kind === 'bed');
  return beds.find((b) => regionOf(b) === regionOf(entity)) ?? beds.find((b) => b.region === 'underworld') ?? beds[0];
}

function stopEverything(hero: HeroState): void {
  hero.move = { x: 0, z: 0 };
  hero.sprint = false;
  hero.jumpHeld = false;
  hero.attack = null;
  hero.dodge = null;
  hero.lockTarget = null;
  hero.blink = null;
  hero.buffer = null;
  hero.abilityHeld = false;
  hero.chargeHeld = false;
  hero.charge = null;
  hero.weaponHeld = false;
  hero.ultimate = null;
  hero.vy = 0;
}

/** Lie down at a bed (F). `fromTick` lets a revive start already in the dark. */
export function startRest(ctx: SimContext, entity: Entity & { hero: HeroState }, bed: Entity, fromTick = 0): void {
  stopEverything(entity.hero);
  entity.region = bed.region;
  entity.position = bedSide(bed);
  entity.rotationY = bed.rotationY;
  entity.hero.grounded = true;
  entity.hero.rest = { t: fromTick, bedId: bed.id };
  ctx.emit('hero:resting', { entityId: entity.id, bedId: bed.id });
}

/** Busy resting, fallen or resetting: input is ignored. */
export function isResting(hero: HeroState): boolean {
  return !!hero.rest || hero.down != null || hero.resetting != null;
}

/** "Reset level" (Esc menu): fade out, then wake at the bed with the level started over. */
export function startReset(ctx: SimContext, entity: Entity & { hero: HeroState }): string | null {
  if (ctx.world.cutscene) return 'cutscene active';
  if (isResting(entity.hero)) return 'busy';
  stopEverything(entity.hero);
  entity.hero.resetting = 0;
  ctx.emit('level:resetting', { entityId: entity.id });
  return null;
}

/**
 * Advances rest and falling for one hero. Returns true while either is
 * running, so the hero's normal update is skipped that tick.
 */
export function updateRest(ctx: SimContext, entity: Entity & { hero: HeroState }): boolean {
  const hero = entity.hero;
  if (hero.resetting != null) {
    hero.resetting += 1;
    if (hero.resetting >= RESET_FADE && ctx.isAuthority) {
      hero.resetting = null;
      wakeAtBed(ctx, entity);
      restartEncounters(ctx);
      ctx.emit('level:reset', { entityId: entity.id, reason: 'reset' });
    }
    return true;
  }
  if (ctx.isAuthority && hero.down == null && !hero.rest && entity.health && entity.health.current <= 0) {
    stopEverything(hero);
    hero.down = 0;
    ctx.emit('hero:down', { entityId: entity.id });
  }
  if (hero.down != null) {
    hero.down += 1;
    // A companion (the god you're not controlling) is down for 10 s, then gets up near you.
    const leaderId = Object.values(ctx.world.players).find((p) => p.party?.includes(entity.id) && p.entityId !== entity.id)?.entityId;
    const leader = leaderId ? ctx.world.entities[leaderId] : undefined;
    if (leader && hero.down >= COMPANION_DOWN_TICKS && ctx.isAuthority) {
      hero.down = null;
      if (entity.health) entity.health.current = Math.round(entity.health.max / 2);
      const x = leader.position.x - Math.sin(leader.rotationY) * 2;
      const z = leader.position.z - Math.cos(leader.rotationY) * 2;
      entity.region = leader.region;
      entity.position = { x, y: Math.max(groundAt(regionOf(leader), x, z), leader.position.y), z };
      ctx.emit('hero:revived', { entityId: entity.id, bedId: null });
      return true;
    }
    if (leader) return true;
    if (hero.down >= DOWN.total && ctx.isAuthority) {
      hero.down = null;
      const bed = respawnBed(ctx, entity);
      if (bed) {
        // Both gods wake at the bed, and the level starts over (team request, Nov 15).
        wakeAtBed(ctx, entity);
        restartEncounters(ctx);
        ctx.emit('level:reset', { entityId: entity.id, reason: 'fell' });
      } else {
        heal(entity);
        if (hero.lastSafe) entity.position = { ...hero.lastSafe };
      }
      ctx.emit('hero:revived', { entityId: entity.id, bedId: bed?.id ?? null });
    }
    return true;
  }
  if (!hero.rest) return false;
  hero.rest.t += 1;
  if (hero.rest.t === REST_HEAL_TICK && ctx.isAuthority) {
    heal(entity);
    const playerId = Object.values(ctx.world.players).find((p) => p.entityId === entity.id)?.id;
    if (playerId) ctx.emit('hero:rested', { playerId });
  }
  if (hero.rest.t >= REST_TOTAL) {
    const bed = ctx.world.entities[hero.rest.bedId as EntityId];
    if (bed) entity.position = bedSide(bed);
    hero.rest = null;
    hero.lastSafe = { ...entity.position };
  }
  return true;
}

function heal(entity: Entity): void {
  if (entity.health) entity.health.current = entity.health.max;
  if (entity.stamina) entity.stamina.current = entity.stamina.max;
  entity.statuses = [];
}
