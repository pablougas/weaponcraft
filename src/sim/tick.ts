import type { GameEvent } from './events';
import { CUTSCENE_ALLOWED_INTENTS, type Intent } from './intents';
import type { PhysicsWorld } from './physics';
import { updateStatuses } from './combat';
import { applyHeroIntent, updateHeroes } from './systems/hero';
import { switchCharacter, updateCompanions } from './systems/party';
import { updateRoute } from './systems/route';
import { updateSoldiers } from './systems/soldiers';
import { findMech, updateMech } from './systems/mech';
import { updateSpirits } from './systems/spirits';
import { FREED_ID, skipFreed, updateFreed } from './cutscenes/freed';
import { updateReveal } from './systems/reveal';
import { DESCENT_ID, skipDescent, updateDescent } from './cutscenes/descent';
import { rocketTicks, skipRocket, startRocket, updateRocket } from './cutscenes/rocket';
import { applyItemIntent } from './systems/items';
import { completeStep, tutorialComplete, updateTutorial } from './tutorial';
import { updateCreatures } from './systems/wildlife';
import { groundAt, regionOf } from './regions';
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
  // Companions decide before physics syncs, so a catch-up teleport moves their body too.
  updateCompanions(ctx);

  // Rapier steps with the sim: sync bodies from state, then update queries.
  if (input.physics) {
    input.physics.syncFrom(world);
    input.physics.step();
  }
  updateStatuses(ctx);
  updateHeroes(ctx, input.physics);
  if (input.isAuthority) updateCreatures(ctx, input.physics);
  updateSoldiers(ctx, input.physics);
  updateMech(ctx);
  updateSpirits(ctx);
  updateReveal(ctx);
  updateRoute(ctx, events.filter((e): e is Extract<typeof e, { type: 'entity:defeated' }> => e.type === 'entity:defeated'));

  // Prologue: tutorial progress, then the rocket when every step is done (SPEC §3.1–3.2).
  if (input.isAuthority) {
    updateTutorial(ctx, events);
    if (!world.flags.prologueDone && !world.cutscene && !world.flags.olympusShattered && tutorialComplete(world)) startRocket(ctx);
    else if (rocketTicks(world) !== null) updateRocket(ctx);
    else if (world.cutscene?.id === DESCENT_ID) updateDescent(ctx);
    else if (world.cutscene?.id === FREED_ID) updateFreed(ctx);
  }

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
    case 'dev:teleport': {
      if (!ctx.isAuthority) return;
      const heroId = world.players[intent.playerId].entityId;
      const hero = heroId ? world.entities[heroId] : undefined;
      if (!hero?.hero || !Number.isFinite(intent.x) || !Number.isFinite(intent.z)) {
        reject('no hero to move');
        return;
      }
      const position = { x: intent.x, y: groundAt(regionOf(hero), intent.x, intent.z), z: intent.z };
      hero.position = position;
      if (intent.rotationY !== undefined && Number.isFinite(intent.rotationY)) hero.rotationY = intent.rotationY;
      hero.hero.vy = 0;
      hero.hero.grounded = true;
      hero.hero.dodge = null;
      hero.hero.lastSafe = { ...position };
      return;
    }
    case 'dev:breakBarricade': {
      const barricade = Object.values(world.entities).find((e) => e.structure?.kind === 'barricade');
      if (barricade?.health) barricade.health.current = 0;
      else reject('no barricade');
      return;
    }
    case 'dev:weakenMech': {
      if (!ctx.isAuthority) return;
      const mech = findMech(world);
      const plating = mech?.mech.platingId ? world.entities[mech.mech.platingId] : undefined;
      if (!plating?.health || !Number.isFinite(intent.fraction)) {
        reject('no mech');
        return;
      }
      plating.health.current = Math.max(1, Math.round(plating.health.max * Math.min(1, Math.max(0, intent.fraction))));
      return;
    }
    case 'cutscene:skip': {
      const id = world.cutscene?.id;
      const reason = id === DESCENT_ID ? skipDescent(ctx) : id === FREED_ID ? skipFreed(ctx) : skipRocket(ctx);
      if (reason) reject(reason);
      return;
    }
    case 'player:declare': {
      const player = world.players[intent.playerId];
      player.seenRocket = player.seenRocket || intent.seenRocket;
      player.seenCutscenes = [...new Set([...(player.seenCutscenes ?? []), ...(intent.seenCutscenes ?? []), ...(intent.seenRocket ? ['rocket'] : [])])];
      // A cutscene already running becomes skippable once every player has declared seeing it.
      const running = world.cutscene;
      if (running && Object.values(world.players).every((p) => p.seenCutscenes?.includes(running.id))) running.skippable = true;
      return;
    }
    case 'dev:tutorial':
      if (!completeStep(ctx, intent.stepId)) reject('unknown or already done');
      return;
    case 'dev:give':
    case 'player:equip':
    case 'player:fuse': {
      const reason = applyItemIntent(ctx, intent);
      if (reason) reject(reason);
      return;
    }
    case 'player:move':
    case 'player:action': {
      if (intent.type === 'player:action' && intent.action === 'switchCharacter') {
        const reason = switchCharacter(ctx, intent.playerId);
        if (reason) reject(reason);
        return;
      }
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
