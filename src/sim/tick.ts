import type { GameEvent } from './events';
import { CUTSCENE_ALLOWED_INTENTS, type Intent } from './intents';
import type { PhysicsWorld } from './physics';
import { applyHeroIntent, updateHeroes } from './systems/hero';
import { updateCreatures } from './systems/wildlife';
import type { WorldState } from './types';
import { createSimContext, despawn, spawn, type SimContext } from './world';

export { TICK_HZ, TICK_MS } from './constants';

export interface TickInput {
  /** Wall-clock time for this tick, stamped by the engine (synced in co-op later). */
  nowMs: number;
  /** Intents received since the last tick, in arrival order. */
  intents: readonly Intent[];
  isAuthority: boolean;
  /** Rapier collision. Without it (unit tests) characters walk on the terrain height. */
  physics?: PhysicsWorld;
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

  // Rapier steps with the sim: sync bodies from state, then update queries.
  if (input.physics) {
    input.physics.syncFrom(world);
    input.physics.step();
  }
  updateHeroes(ctx, input.physics);
  if (input.isAuthority) updateCreatures(ctx);

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
    case 'player:move':
    case 'player:action': {
      const reason = applyHeroIntent(ctx, intent);
      // Held-input updates are sent every tick; only report rejected button presses.
      if (reason && intent.type === 'player:action') reject(reason);
      return;
    }
    default: {
      const unknown: never = intent;
      reject(`unknown intent ${(unknown as { type: string }).type}`);
    }
  }
}
