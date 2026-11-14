import type { EventMap, EventType, GameEvent } from './events';
import type { Entity, EntityId, PlayerId, PlayerState, Vec3, WorldState } from './types';

export const WORLD_VERSION = 1;

/** The single local player's ID in single-player (host + one local player). */
export const DEFAULT_PLAYER_ID: PlayerId = 'p1';

/** A brand-new world: prologue not yet played, one local player, no entities. */
export function createWorld(seed: number, nowMs: number, playerIds: readonly PlayerId[] = [DEFAULT_PLAYER_ID]): WorldState {
  const players: Record<PlayerId, PlayerState> = {};
  playerIds.forEach((id, index) => {
    players[id] = { id, name: `Player ${index + 1}`, entityId: null };
  });
  return {
    version: WORLD_VERSION,
    seed: seed >>> 0,
    tick: 0,
    nowMs,
    nextEntityId: 1,
    entities: {},
    players,
    flags: { prologueDone: false, olympusShattered: false, meadowPopulated: false },
    cutscene: null,
    rngStreams: {},
  };
}

/**
 * What a sim function needs besides state: whether this peer decides outcomes
 * (CLAUDE.md rule 5 — always true until co-op) and a way to emit events.
 */
export interface SimContext {
  world: WorldState;
  isAuthority: boolean;
  emit<K extends EventType>(type: K, payload: EventMap[K]): void;
}

/** Collects emitted events into a plain array, stamped with the current tick. */
export function createSimContext(world: WorldState, isAuthority: boolean): { ctx: SimContext; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const ctx: SimContext = {
    world,
    isAuthority,
    emit(type, payload) {
      events.push({ type, tick: world.tick, ...payload } as GameEvent);
    },
  };
  return { ctx, events };
}

export interface SpawnInit {
  position?: Vec3;
  rotationY?: number;
  ownerId?: PlayerId | null;
  data?: Entity['data'];
}

/**
 * The one way to create entities (CLAUDE.md rule 4). Returns a stable ID that
 * is never reused in this world, so events, saves and network messages can
 * refer to it.
 */
export function spawn(ctx: SimContext, defId: string, init: SpawnInit = {}): EntityId {
  const { world } = ctx;
  const id: EntityId = `e${world.nextEntityId}`;
  world.nextEntityId += 1;
  world.entities[id] = {
    id,
    defId,
    position: { ...(init.position ?? { x: 0, y: 0, z: 0 }) },
    rotationY: init.rotationY ?? 0,
    ownerId: init.ownerId ?? null,
    data: structuredClone(init.data ?? {}),
  };
  ctx.emit('entity:spawned', { entityId: id, defId });
  return id;
}

/** Removes an entity. Returns false if it didn't exist. */
export function despawn(ctx: SimContext, id: EntityId): boolean {
  const entity = ctx.world.entities[id];
  if (!entity) return false;
  delete ctx.world.entities[id];
  for (const player of Object.values(ctx.world.players)) {
    if (player.entityId === id) player.entityId = null;
  }
  ctx.emit('entity:despawned', { entityId: id, defId: entity.defId });
  return true;
}

export function entityCount(world: WorldState): number {
  return Object.keys(world.entities).length;
}
