import { ticks } from '../constants';
import { GROTTO, grottoPoint } from '../regions';
import { groundHeightAt } from '../terrain/meadow-rocks';
import type { Entity, HeroState, Vec3 } from '../types';
import { spawn, type SimContext } from '../world';

/**
 * "The Descent" (SPEC §3.3, M5.1): straight after the rocket, with no
 * control in between, Hades steps out of a shadow portal, tells Zeus the
 * surface is lost, and takes him through a second portal to the Outer
 * Grotto, where they find that the humans have chained Cerberus to power
 * their mech. Runs in sim ticks like the rocket; the view draws it.
 */
export const DESCENT_ID = 'descent';

export const DESCENT_BEATS = {
  /** A shadow portal opens in front of Zeus. */
  portal: 0,
  /** Hades steps out and walks up to Zeus. */
  hades: ticks(1.5),
  lineHades1: ticks(3.5),
  lineZeus: ticks(7.5),
  lineHades2: ticks(10.5),
  /** Hades opens the way down behind them. */
  portalDown: ticks(14),
  /** They step through; the screen fades calmly to black. */
  fadeOut: ticks(16),
  /** Both gods arrive in the Outer Grotto (still black, then fading in). */
  arrive: ticks(17.5),
  lineGrotto: ticks(19.5),
  /** The dispatch by the humans' conduit rig: Cerberus is chained to power the Mk. II. */
  dispatch: ticks(22),
  lineFree: ticks(26.5),
  end: ticks(30),
} as const;

export type DescentBeat = keyof typeof DESCENT_BEATS;

/** Grotto layout, in metres from its centre. */
export const GROTTO_SPOTS = {
  zeus: { x: 0, z: 8, rotationY: Math.PI },
  hades: { x: 2.6, z: 5.5, rotationY: Math.PI + 0.6 },
  altar: { x: -7.5, z: 1.5 },
  bed: { x: 7.5, z: 4 },
  /** The humans' conduit rig and the dispatch left on a crate beside it. */
  rig: { x: 5.5, z: -9 },
  dispatch: { x: 3.4, z: -7.6 },
  /** Their barricade across the tunnel deeper into the Underworld (opens in M6). */
  barricade: { x: 0, z: -18.5 },
} as const;

export function descentTicks(ctx: { world: { cutscene: { id: string; startTick: number } | null; tick: number } }): number | null {
  const cutscene = ctx.world.cutscene;
  return cutscene?.id === DESCENT_ID ? ctx.world.tick - cutscene.startTick : null;
}

function heroes(ctx: SimContext): Array<Entity & { hero: HeroState }> {
  return Object.values(ctx.world.players)
    .map((p) => (p.entityId ? ctx.world.entities[p.entityId] : undefined))
    .filter((e): e is Entity & { hero: HeroState } => !!e?.hero);
}

function hadesNpc(ctx: SimContext): Entity | undefined {
  return Object.values(ctx.world.entities).find((e) => e.defId === 'hades' && e.npc);
}

/** Starts the descent (right after the rocket, or on loading an older save). */
export function startDescent(ctx: SimContext): void {
  const { world } = ctx;
  if (world.cutscene || world.flags.descended) return;
  const players = Object.values(world.players);
  const skippable = players.length > 0 && players.every((p) => p.seenCutscenes?.includes(DESCENT_ID));
  const zeus = heroes(ctx)[0];
  const at = zeus?.position ?? { x: 0, y: 0, z: 0 };
  const facing = zeus?.rotationY ?? 0;
  // The arrival portal opens 3.2 m in front of Zeus; the way down 3 m behind him.
  const ahead = (d: number): Vec3 => {
    const x = at.x + Math.sin(facing) * d;
    const z = at.z + Math.cos(facing) * d;
    return { x, y: groundHeightAt(x, z), z };
  };
  world.cutscene = { id: DESCENT_ID, startTick: world.tick, skippable, points: { portalUp: ahead(3.2), portalDown: ahead(-3) } };
  for (const hero of heroes(ctx)) {
    hero.hero.move = { x: 0, z: 0 };
    hero.hero.sprint = false;
    hero.hero.jumpHeld = false;
    hero.hero.lockTarget = null;
  }
  ctx.emit('cutscene:start', { cutsceneId: DESCENT_ID, skippable });
}

/** Advances the descent by a tick. */
export function updateDescent(ctx: SimContext): void {
  const { world } = ctx;
  const t = descentTicks(ctx);
  const points = world.cutscene?.points;
  if (t === null || !points) return;
  for (const [beat, at] of Object.entries(DESCENT_BEATS) as Array<[DescentBeat, number]>) {
    if (t === at && beat !== 'end') ctx.emit('cutscene:beat', { cutsceneId: DESCENT_ID, beat });
  }
  const zeus = heroes(ctx)[0];

  // Hades steps out of the portal and walks up to Zeus, facing him.
  if (t === DESCENT_BEATS.hades && !hadesNpc(ctx)) spawnHadesNpc(ctx, points.portalUp, 'surface');
  const hades = hadesNpc(ctx);
  if (hades && zeus && hades.region !== 'underworld' && t >= DESCENT_BEATS.hades && t < DESCENT_BEATS.lineHades1) {
    const f = (t - DESCENT_BEATS.hades) / (DESCENT_BEATS.lineHades1 - DESCENT_BEATS.hades);
    const from = points.portalUp;
    // Stop 1.4 m short of Zeus.
    const gap = Math.max(0.001, Math.hypot(zeus.position.x - from.x, zeus.position.z - from.z));
    const k = Math.max(0, 1 - 1.4 / gap);
    const to = { x: from.x + (zeus.position.x - from.x) * k, z: from.z + (zeus.position.z - from.z) * k };
    const x = from.x + (to.x - from.x) * f;
    const z = from.z + (to.z - from.z) * f;
    hades.position = { x, y: groundHeightAt(x, z), z };
  }
  if (hades && zeus && hades.region !== 'underworld') {
    hades.rotationY = Math.atan2(zeus.position.x - hades.position.x, zeus.position.z - hades.position.z);
    if (t >= DESCENT_BEATS.lineHades1 && t < DESCENT_BEATS.portalDown) {
      zeus.rotationY = Math.atan2(hades.position.x - zeus.position.x, hades.position.z - zeus.position.z);
    }
  }

  if (t === DESCENT_BEATS.arrive) arriveInGrotto(ctx);
  if (t >= DESCENT_BEATS.end) finishDescent(ctx, false);
}

function spawnHadesNpc(ctx: SimContext, at: Vec3, region: 'surface' | 'underworld', rotationY = 0): void {
  const id = spawn(ctx, 'hades', { position: { ...at }, rotationY });
  const entity = ctx.world.entities[id];
  entity.npc = { name: 'Hades' };
  entity.body = { radius: 0.36, height: 2.1 };
  entity.region = region;
}

/** Both gods appear in the Outer Grotto, which becomes the Refuge. */
function arriveInGrotto(ctx: SimContext): void {
  const { world } = ctx;
  const zeusSpot = GROTTO_SPOTS.zeus;
  heroes(ctx).forEach((hero, i) => {
    hero.region = 'underworld';
    hero.position = grottoPoint(zeusSpot.x - i * 1.5, zeusSpot.z);
    hero.rotationY = zeusSpot.rotationY;
    hero.hero.vy = 0;
    hero.hero.grounded = true;
    hero.hero.dodge = null;
    hero.hero.blink = null;
    hero.hero.lastSafe = { ...hero.position };
  });
  const hades = hadesNpc(ctx);
  const spot = GROTTO_SPOTS.hades;
  if (hades) {
    hades.region = 'underworld';
    hades.position = grottoPoint(spot.x, spot.z);
    hades.rotationY = spot.rotationY;
  } else {
    spawnHadesNpc(ctx, grottoPoint(spot.x, spot.z), 'underworld', spot.rotationY);
  }
  ensureGrotto(ctx);
  world.flags.descended = true;
}

/** The grotto's Refuge pieces and story props, once. */
export function ensureGrotto(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.grottoBuilt) return;
  const place = (defId: string, kind: NonNullable<Entity['structure']>['kind'], x: number, z: number, rotationY: number, body: { radius: number; height: number } | null) => {
    const id = spawn(ctx, defId, { position: grottoPoint(x, z), rotationY });
    const entity = world.entities[id];
    entity.structure = { kind };
    entity.region = 'underworld';
    if (body) entity.body = body;
  };
  const s = GROTTO_SPOTS;
  place('fusion-altar', 'fusion-altar', s.altar.x, s.altar.z, Math.PI / 2, { radius: 0.85, height: 1.2 });
  place('bed', 'bed', s.bed.x, s.bed.z, -0.5, { radius: 1.0, height: 1.0 });
  place('dispatch', 'dispatch', s.dispatch.x, s.dispatch.z, 0.3, null);
  place('barricade', 'barricade', s.barricade.x, s.barricade.z, 0, null);
  world.flags.grottoBuilt = true;
}

function finishDescent(ctx: SimContext, skipped: boolean): void {
  const { world } = ctx;
  if (!world.flags.descended) arriveInGrotto(ctx);
  world.cutscene = null;
  world.flags.prologueDone = true;
  for (const player of Object.values(world.players)) {
    player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), DESCENT_ID])];
  }
  ctx.emit('cutscene:end', { cutsceneId: DESCENT_ID, skipped });
  world.objective = 'find-and-free-cerberus';
  ctx.emit('objective:set', { objectiveId: 'find-and-free-cerberus' });
}

export function skipDescent(ctx: SimContext): string | null {
  const { world } = ctx;
  if (world.cutscene?.id !== DESCENT_ID) return 'nothing to skip';
  if (!world.cutscene.skippable) return 'not skippable the first time';
  finishDescent(ctx, true);
  return null;
}

/** How far the descent is through, in ticks, for tests and the view. */
export const DESCENT_LENGTH = DESCENT_BEATS.end;
export const GROTTO_FLOOR_Y = GROTTO.center.y;
