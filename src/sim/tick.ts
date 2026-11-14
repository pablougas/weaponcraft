import type { GameEvent } from './events';
import { CUTSCENE_ALLOWED_INTENTS, type Intent } from './intents';
import type { WorldState } from './types';
import { createSimContext, despawn, spawn, type SimContext } from './world';

/** The sim runs at a fixed 30 Hz (CLAUDE.md rule 7). */
export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;

export interface TickInput {
  /** Wall-clock time for this tick, stamped by the engine (synced in co-op later). */
  nowMs: number;
  /** Intents received since the last tick, in arrival order. */
  intents: readonly Intent[];
  isAuthority: boolean;
}

/**
 * Advances the world by one fixed step. Mutates `world` and returns the events
 * emitted during the tick. Deterministic: the same world + input always gives
 * the same result.
 */
export function tickWorld(world: WorldState, input: TickInput): GameEvent[] {
  world.tick += 1;
  world.nowMs = input.nowMs;
  const { ctx, events } = createSimContext(world, input.isAuthority);

  for (const intent of input.intents) {
    applyIntent(ctx, intent);
  }

  // Systems (movement, combat, AI, cutscenes...) run here from M3 on.

  return events;
}

function applyIntent(ctx: SimContext, intent: Intent): void {
  const { world } = ctx;
  const reject = (reason: string) => ctx.emit('intent:rejected', {
    playerId: intent.playerId,
    intentType: intent.type,
    reason,
  });

  if (!world.players[intent.playerId]) {
    reject('unknown player');
    return;
  }
  // The input layer is locked while a cutscene plays (SPEC §3.2).
  if (world.cutscene && !CUTSCENE_ALLOWED_INTENTS.has(intent.type)) {
    reject('cutscene active');
    return;
  }

  switch (intent.type) {
    case 'dev:spawn':
      if (!ctx.isAuthority) return;
      spawn(ctx, intent.defId, { position: intent.position });
      return;
    case 'dev:despawn':
      if (!ctx.isAuthority) return;
      if (!despawn(ctx, intent.entityId)) reject('no such entity');
      return;
    default: {
      const unknown: never = intent;
      reject(`unknown intent ${(unknown as { type: string }).type}`);
    }
  }
}
