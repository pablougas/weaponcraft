import type { WorldState } from './types';
import { WORLD_VERSION } from './world';

/**
 * One serializer for saves and future network snapshots (CLAUDE.md rule 9).
 * The world is plain data, so this is JSON plus validation.
 */
const FORMAT = 'weaponcraft-world';

interface Envelope {
  format: typeof FORMAT;
  version: number;
  world: WorldState;
}

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export function serialize(world: WorldState): string {
  const envelope: Envelope = { format: FORMAT, version: WORLD_VERSION, world };
  return JSON.stringify(envelope);
}

/** Parses and validates a serialized world. Throws `SaveFormatError` if it isn't one. */
export function deserialize(text: string): WorldState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveFormatError('Not valid JSON.');
  }
  if (!isObject(parsed) || parsed.format !== FORMAT) {
    throw new SaveFormatError('Not a Weaponcraft world.');
  }
  if (parsed.version !== WORLD_VERSION) {
    throw new SaveFormatError(`Unsupported world version ${String(parsed.version)}.`);
  }
  const world = parsed.world;
  if (!isObject(world)) throw new SaveFormatError('Missing world.');

  for (const key of ['seed', 'tick', 'nowMs', 'nextEntityId'] as const) {
    if (typeof world[key] !== 'number' || !Number.isFinite(world[key])) {
      throw new SaveFormatError(`world.${key} must be a number.`);
    }
  }
  for (const key of ['entities', 'players', 'flags', 'rngStreams'] as const) {
    if (!isObject(world[key])) throw new SaveFormatError(`world.${key} must be an object.`);
  }
  if (world.cutscene !== null && !isObject(world.cutscene)) {
    throw new SaveFormatError('world.cutscene must be an object or null.');
  }
  for (const [id, entity] of Object.entries(world.entities as Record<string, unknown>)) {
    if (!isObject(entity) || entity.id !== id || typeof entity.defId !== 'string' || !isObject(entity.position)) {
      throw new SaveFormatError(`Entity ${id} is malformed.`);
    }
  }
  return migrate(world as unknown as WorldState);
}

/** Fills in fields added after a save was written (older saves stay loadable). */
function migrate(world: WorldState): WorldState {
  world.customWeapons ??= {};
  world.codex ??= {};
  world.tutorial ??= { done: [], movedTicks: 0, sprintTicks: 0 };
  world.objective ??= null;
  world.olympusShatteredAtMs ??= null;
  for (const player of Object.values(world.players)) player.inventory ??= [];
  return world;
}

/** A deep, detached copy of the world (via the serializer). */
export function cloneWorld(world: WorldState): WorldState {
  return deserialize(serialize(world));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
