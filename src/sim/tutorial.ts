import type { GameEvent } from './events';
import type { WorldState } from './types';
import type { SimContext } from './world';

/**
 * The prologue's tutorial steps, in the order they're taught (SPEC §3.1).
 * Each is completed by doing it; any order counts, and the prompt shows the
 * first step not done yet. When all are done, the rocket cinematic starts.
 */
export const TUTORIAL_STEPS = ['move', 'sprint', 'jump', 'roll', 'attack', 'ability', 'pickup', 'fuse'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEPS)[number];

/** Walking this long completes "move" (about 2 s). */
const MOVE_TICKS = 60;
/** Sprinting this long completes "sprint" (about 1 s). */
const SPRINT_TICKS = 30;

export function nextTutorialStep(world: WorldState): TutorialStepId | null {
  return TUTORIAL_STEPS.find((id) => !world.tutorial.done.includes(id)) ?? null;
}

export function tutorialComplete(world: WorldState): boolean {
  return nextTutorialStep(world) === null;
}

/** Marks a step done (once) and announces it. Returns true if it was new. */
export function completeStep(ctx: SimContext, stepId: string): boolean {
  const { world } = ctx;
  if (!(TUTORIAL_STEPS as readonly string[]).includes(stepId) || world.tutorial.done.includes(stepId)) return false;
  world.tutorial.done.push(stepId);
  ctx.emit('tutorial:step', { stepId, next: nextTutorialStep(world) });
  return true;
}

/**
 * Checks this tick's state and events for tutorial progress. Only runs during
 * the prologue. `events` are the events emitted so far this tick.
 */
export function updateTutorial(ctx: SimContext, events: readonly GameEvent[]): void {
  const { world } = ctx;
  if (world.flags.prologueDone || world.cutscene || tutorialComplete(world)) return;
  const heroes = Object.values(world.players)
    .map((p) => (p.entityId ? world.entities[p.entityId] : undefined))
    .filter((e) => e?.hero);
  const heroIds = new Set(heroes.map((h) => h!.id));

  if (heroes.some((h) => h!.hero!.moving)) world.tutorial.movedTicks += 1;
  if (heroes.some((h) => h!.hero!.sprinting)) world.tutorial.sprintTicks += 1;
  if (world.tutorial.movedTicks >= MOVE_TICKS) completeStep(ctx, 'move');
  if (world.tutorial.sprintTicks >= SPRINT_TICKS) completeStep(ctx, 'sprint');

  for (const event of events) {
    switch (event.type) {
      case 'hero:jump':
        if (heroIds.has(event.entityId)) completeStep(ctx, 'jump');
        break;
      case 'hero:dodge':
        if (heroIds.has(event.entityId)) completeStep(ctx, 'roll');
        break;
      case 'combat:hit':
        // A light or heavy weapon strike, a punch or the Lightning Fist on anything.
        if (event.attackerId && heroIds.has(event.attackerId) && event.kind !== 'status' && event.kind !== 'ability') completeStep(ctx, 'attack');
        break;
      case 'ability:cast':
        if (heroIds.has(event.casterId)) completeStep(ctx, 'ability');
        break;
      case 'item:picked':
        completeStep(ctx, 'pickup');
        break;
      case 'fusion:created':
        completeStep(ctx, 'fuse');
        break;
      default:
    }
  }
}
