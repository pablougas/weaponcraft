import { ticks } from '../constants';
import type { EntityId } from '../types';
import type { SimContext } from '../world';

/**
 * "Cerberus Freed" (SPEC §10, cut-down M7): the Mk. II's plating breaks, it
 * powers down, the conduits feeding on the hound burst, his chains snap, and
 * Cerberus rises, howls, and bonds with both gods (Three-Fold Howl on E).
 * Short and skippable once seen, like the others. Runs in sim ticks; the view
 * draws it from cutscene time.
 */
export const FREED_ID = 'cerberus-freed';

export const FREED_BEATS = {
  /** The Mk. II sags, its eyes go dark. */
  powerDown: 0,
  /** The conduits from the hound to the mech crack and burst. */
  conduits: ticks(2.5),
  /** The chains snap. */
  chains: ticks(4.5),
  /** Cerberus rises, his fire returning. */
  rise: ticks(6),
  /** The Three-Fold Howl. */
  howl: ticks(8.5),
  /** His light flows into both gods. */
  bond: ticks(10.5),
  end: ticks(13.5),
} as const;

export type FreedBeat = keyof typeof FREED_BEATS;

export function freedTicks(world: { cutscene: { id: string; startTick: number } | null; tick: number }): number | null {
  return world.cutscene?.id === FREED_ID ? world.tick - world.cutscene.startTick : null;
}

/** Starts the scene as the Mk. II powers down. */
export function startFreed(ctx: SimContext, mechId: EntityId): void {
  const { world } = ctx;
  if (world.cutscene || world.flags.cerberusFreed) return;
  const players = Object.values(world.players);
  const skippable = players.length > 0 && players.every((p) => p.seenCutscenes?.includes(FREED_ID));
  const mech = world.entities[mechId];
  world.cutscene = { id: FREED_ID, startTick: world.tick, skippable, points: mech ? { mech: { ...mech.position } } : {} };
  for (const entity of Object.values(world.entities)) {
    if (!entity.hero) continue;
    entity.hero.move = { x: 0, z: 0 };
    entity.hero.sprint = false;
    entity.hero.jumpHeld = false;
    entity.hero.lockTarget = null;
    entity.hero.attack = null;
    entity.hero.charge = null;
    entity.hero.ultimate = null;
  }
  ctx.emit('cutscene:start', { cutsceneId: FREED_ID, skippable });
}

/** Advances the scene by a tick. */
export function updateFreed(ctx: SimContext): void {
  const t = freedTicks(ctx.world);
  if (t === null) return;
  for (const [beat, at] of Object.entries(FREED_BEATS) as Array<[FreedBeat, number]>) {
    if (t === at && beat !== 'end') ctx.emit('cutscene:beat', { cutsceneId: FREED_ID, beat });
  }
  if (t >= FREED_BEATS.end) finishFreed(ctx, false);
}

function finishFreed(ctx: SimContext, skipped: boolean): void {
  const { world } = ctx;
  world.cutscene = null;
  world.flags.cerberusFreed = true;
  for (const player of Object.values(world.players)) {
    player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), FREED_ID])];
  }
  ctx.emit('cutscene:end', { cutsceneId: FREED_ID, skipped });
  ctx.emit('spirit:freed', { spiritId: 'cerberus' });
  world.objective = 'cerberus-freed';
  ctx.emit('objective:set', { objectiveId: 'cerberus-freed' });
}

export function skipFreed(ctx: SimContext): string | null {
  if (ctx.world.cutscene?.id !== FREED_ID) return 'nothing to skip';
  if (!ctx.world.cutscene.skippable) return 'not skippable the first time';
  finishFreed(ctx, true);
  return null;
}
