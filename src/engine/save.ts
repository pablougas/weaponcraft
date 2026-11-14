import { deserialize, serialize, type WorldState } from '../sim';

/**
 * localStorage saves. itch.io serves many games from one domain, so every key
 * is namespaced `weaponcraft:*` (SPEC §16).
 */
export const SAVE_KEY = 'weaponcraft:save:v1';

/** The parts of `Storage` we use, so tests can pass an in-memory fake. */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage, or undefined if the browser blocks it (e.g. some iframes). */
export function browserStorage(): SaveStorage | undefined {
  try {
    const storage = window.localStorage;
    const probe = 'weaponcraft:probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return undefined;
  }
}

export type LoadResult =
  | { status: 'loaded'; world: WorldState }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string };

export function loadSave(storage: SaveStorage | undefined): LoadResult {
  if (!storage) return { status: 'empty' };
  let text: string | null;
  try {
    text = storage.getItem(SAVE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (text === null) return { status: 'empty' };
  try {
    return { status: 'loaded', world: deserialize(text) };
  } catch (error) {
    return { status: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Returns false if the save couldn't be written (storage blocked or full). */
export function writeSave(storage: SaveStorage | undefined, world: WorldState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serialize(world));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: SaveStorage | undefined): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
