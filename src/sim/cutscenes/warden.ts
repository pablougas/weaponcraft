import { ticks } from '../constants';
import { groundAt } from '../regions';
import { MECH_SIZE } from '../terrain/underworld';
import type { EntityId, Vec3 } from '../types';
import { findWarden, spawnWarden } from '../systems/warden';
import type { SimContext } from '../world';

/**
 * "The Warden" (SPEC §10, M7): the Mk. II's plating breaks, its rear hatch
 * bursts open, the machine groans and collapses, and its pilot climbs out —
 * a huge, mean man with a maul — drops to the ground and roars. Then the
 * fight. Runs in sim ticks; the view draws it. Skippable once seen.
 */
export const WARDEN_ID = 'warden-emerges';

export const WARDEN_BEATS = {
  powerDown: 0,
  /** The rear hatch bursts open. */
  hatch: ticks(2),
  /** The Mk. II groans and collapses. */
  breakdown: ticks(3.5),
  /** The Warden climbs out of the hatch… */
  emerge: ticks(5),
  /** …drops to the ground and walks out. */
  land: ticks(6.2),
  /** He roars his challenge. */
  roar: ticks(8),
  end: ticks(10),
} as const;

export type WardenBeat = keyof typeof WARDEN_BEATS;

export function wardenTicks(world: { cutscene: { id: string; startTick: number } | null; tick: number }): number | null {
  return world.cutscene?.id === WARDEN_ID ? world.tick - world.cutscene.startTick : null;
}

/** Where the scene happens, from the mech's pose: the hatch (high on its back), where he lands, where he stops. */
export function wardenPoints(mech: { position: Vec3; rotationY: number }): Record<'mech' | 'hatch' | 'land' | 'stand' | 'gods', Vec3> {
  const back = { x: -Math.sin(mech.rotationY), z: -Math.cos(mech.rotationY) };
  const at = (d: number, dy = 0): Vec3 => {
    const x = mech.position.x + back.x * d;
    const z = mech.position.z + back.z * d;
    return { x, y: groundAt('underworld', x, z) + dy, z };
  };
  return {
    mech: { ...mech.position },
    hatch: at(MECH_SIZE.halfZ + 0.6, 7),
    land: at(MECH_SIZE.halfZ + 3),
    stand: at(MECH_SIZE.halfZ + 8),
    // The gods wait well back, facing the hatch.
    gods: at(MECH_SIZE.halfZ + 22),
  };
}

/** Starts the scene as the Mk. II's plating breaks. */
export function startWardenScene(ctx: SimContext, mechId: EntityId): void {
  const { world } = ctx;
  if (world.cutscene || world.flags.wardenEmerged) return;
  const mech = world.entities[mechId];
  if (!mech) return;
  const players = Object.values(world.players);
  const skippable = players.length > 0 && players.every((p) => p.seenCutscenes?.includes(WARDEN_ID));
  const points = wardenPoints(mech);
  world.cutscene = { id: WARDEN_ID, startTick: world.tick, skippable, points };
  // Both gods step back to watch, facing the hatch (side by side).
  const gods = Object.values(world.entities).filter((e) => e.hero && e.region === 'underworld');
  const toMech = Math.atan2(points.mech.x - points.gods.x, points.mech.z - points.gods.z);
  gods.forEach((god, i) => {
    const side = (i - (gods.length - 1) / 2) * 2.4;
    const x = points.gods.x + Math.cos(toMech) * side;
    const z = points.gods.z - Math.sin(toMech) * side;
    god.position = { x, y: groundAt('underworld', x, z), z };
    god.rotationY = toMech;
    const hero = god.hero!;
    Object.assign(hero, { move: { x: 0, z: 0 }, sprint: false, jumpHeld: false, lockTarget: null, attack: null, charge: null, ultimate: null, dodge: null, blink: null, vy: 0 });
    hero.lastSafe = { ...god.position };
  });
  ctx.emit('cutscene:start', { cutsceneId: WARDEN_ID, skippable });
}

/** Advances the scene by a tick. */
export function updateWardenScene(ctx: SimContext): void {
  const { world } = ctx;
  const t = wardenTicks(world);
  const points = world.cutscene?.points;
  if (t === null || !points) return;
  for (const [beat, at] of Object.entries(WARDEN_BEATS) as Array<[WardenBeat, number]>) {
    if (t === at && beat !== 'end') ctx.emit('cutscene:beat', { cutsceneId: WARDEN_ID, beat });
  }
  const yaw = Math.atan2(points.gods.x - points.hatch.x, points.gods.z - points.hatch.z);
  if (t === WARDEN_BEATS.emerge && !findWarden(world)) spawnWarden(ctx, points.hatch, yaw);
  const warden = findWarden(world);
  if (warden && t >= WARDEN_BEATS.emerge) {
    // Climb out (stay at the hatch), drop to the ground, then stride out.
    const drop = Math.min(1, Math.max(0, (t - WARDEN_BEATS.emerge - ticks(0.6)) / (WARDEN_BEATS.land - WARDEN_BEATS.emerge - ticks(0.6))));
    const walk = Math.min(1, Math.max(0, (t - WARDEN_BEATS.land) / (WARDEN_BEATS.roar - WARDEN_BEATS.land)));
    const from = drop < 1 ? points.hatch : points.land;
    const to = drop < 1 ? points.land : points.stand;
    const f = drop < 1 ? drop : walk;
    const x = from.x + (to.x - from.x) * f;
    const z = from.z + (to.z - from.z) * f;
    // Falling: from the hatch's height down to the ground (accelerating).
    const y = drop < 1 ? points.hatch.y + (groundAt('underworld', x, z) - points.hatch.y) * f * f : groundAt('underworld', x, z);
    warden.position = { x, y, z };
    warden.rotationY = yaw;
    warden.warden.walking = drop >= 1 && walk < 1;
  }
  if (t >= WARDEN_BEATS.end) finishWardenScene(ctx, false);
}

function finishWardenScene(ctx: SimContext, skipped: boolean): void {
  const { world } = ctx;
  const points = world.cutscene?.points;
  world.cutscene = null;
  world.flags.wardenEmerged = true;
  let warden = findWarden(world);
  if (!warden && points) {
    spawnWarden(ctx, points.stand, Math.atan2(points.gods.x - points.stand.x, points.gods.z - points.stand.z));
    warden = findWarden(world);
  }
  if (warden && points) {
    warden.position = { ...points.stand };
    warden.warden.mode = 'fight';
    warden.warden.walking = false;
  }
  for (const player of Object.values(world.players)) {
    player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), WARDEN_ID])];
  }
  ctx.emit('cutscene:end', { cutsceneId: WARDEN_ID, skipped });
  world.objective = 'defeat-the-warden';
  ctx.emit('objective:set', { objectiveId: 'defeat-the-warden' });
}

export function skipWardenScene(ctx: SimContext): string | null {
  if (ctx.world.cutscene?.id !== WARDEN_ID) return 'nothing to skip';
  if (!ctx.world.cutscene.skippable) return 'not skippable the first time';
  finishWardenScene(ctx, true);
  return null;
}
