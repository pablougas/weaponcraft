import { ticks } from '../constants';
import { startDescent } from './descent';
import type { HeroState, WorldState } from '../types';
import type { SimContext } from '../world';

/**
 * "The Rocket" (SPEC §3.2): a scripted 18 s timeline that runs in sim ticks,
 * so it plays the same for every player and in tests. The view draws it from
 * `world.cutscene` and the tick; the sim only tracks beats and their effects:
 * the summit shatters at impact, and at the end the prologue is over.
 */
export const ROCKET_ID = 'rocket';

/** Beat times, in ticks since the cutscene started. */
export const ROCKET_BEATS = {
  /** Camera eases to the wide shot of Olympus; HUD fades. */
  start: 0,
  /** The rocket streaks across the sky. */
  launch: ticks(1.5),
  /** It hits the summit: one slow bloom swell, shockwave. `olympusShattered` is set here. */
  impact: ticks(6),
  /** The top and the temple break apart; the dust wall rolls down. */
  collapse: ticks(6.6),
  /** Pan down to the human columns climbing from every side. */
  pan: ticks(10.5),
  /** Camera returns behind the god; HUD back. */
  return: ticks(16),
  /** Control returns. */
  end: ticks(18),
} as const;

export type RocketBeat = keyof typeof ROCKET_BEATS;

/** Ticks into the running rocket cutscene, or null if it isn't playing. */
export function rocketTicks(world: WorldState): number | null {
  return world.cutscene?.id === ROCKET_ID ? world.tick - world.cutscene.startTick : null;
}

/** Starts the rocket: skippable only if every player has seen it before. Clears held input. */
export function startRocket(ctx: SimContext): void {
  const { world } = ctx;
  if (world.cutscene || world.flags.olympusShattered) return;
  const players = Object.values(world.players);
  const skippable = players.length > 0 && players.every((p) => p.seenRocket || p.seenCutscenes?.includes(ROCKET_ID));
  world.cutscene = { id: ROCKET_ID, startTick: world.tick, skippable };
  for (const player of players) {
    const hero = player.entityId ? world.entities[player.entityId]?.hero : undefined;
    if (hero) freezeInput(hero);
  }
  ctx.emit('cutscene:start', { cutsceneId: ROCKET_ID, skippable });
}

/** Drops held buttons and actions so nothing carries on while input is locked. */
function freezeInput(hero: HeroState): void {
  hero.move = { x: 0, z: 0 };
  hero.sprint = false;
  hero.jumpHeld = false;
  hero.attack = null;
  hero.dodge = null;
  hero.lockTarget = null;
  hero.blink = null;
  hero.buffer = null;
  hero.abilityHeld = false;
  hero.charge = null;
  hero.weaponHeld = false;
  hero.ultimate = null;
}

/** Advances the rocket timeline by a tick: emits beats, shatters the summit, ends. */
export function updateRocket(ctx: SimContext): void {
  const { world } = ctx;
  const t = rocketTicks(world);
  if (t === null) return;
  for (const [beat, at] of Object.entries(ROCKET_BEATS) as Array<[RocketBeat, number]>) {
    if (t === at && beat !== 'start' && beat !== 'end') ctx.emit('cutscene:beat', { cutsceneId: ROCKET_ID, beat });
  }
  if (t >= ROCKET_BEATS.impact) shatterOlympus(ctx);
  if (t >= ROCKET_BEATS.end) finishRocket(ctx, false);
}

/** Skip (only when skippable): jump straight to the end, impact included. */
export function skipRocket(ctx: SimContext): string | null {
  const { world } = ctx;
  if (world.cutscene?.id !== ROCKET_ID) return 'nothing to skip';
  if (!world.cutscene.skippable) return 'not skippable the first time';
  shatterOlympus(ctx);
  finishRocket(ctx, true);
  return null;
}

function shatterOlympus(ctx: SimContext): void {
  const { world } = ctx;
  if (world.flags.olympusShattered) return;
  world.flags.olympusShattered = true;
  world.olympusShatteredAtMs = world.nowMs;
}

/**
 * The rocket ends: control does not return. Hades's arrival and the descent
 * to the Outer Grotto follow straight on (M5.1, SPEC §3.2 step 5).
 */
function finishRocket(ctx: SimContext, skipped: boolean): void {
  const { world } = ctx;
  world.cutscene = null;
  for (const player of Object.values(world.players)) {
    player.seenRocket = true;
    player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), ROCKET_ID])];
  }
  ctx.emit('cutscene:end', { cutsceneId: ROCKET_ID, skipped });
  startDescent(ctx);
}
