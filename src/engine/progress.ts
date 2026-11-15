import type { SaveStorage } from './save';

/**
 * What this browser remembers across saves (not part of any world):
 * whether the player has watched the rocket cinematic, so later games may skip it.
 */
export const PROGRESS_KEY = 'weaponcraft:progress:v1';

export interface Progress {
  seenRocket: boolean;
  /** Cutscene IDs this browser has seen (they become skippable). */
  seenCutscenes?: string[];
}

export function loadProgress(storage: SaveStorage | undefined): Progress {
  try {
    const raw = storage?.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Progress>) : {};
    const seen = Array.isArray(parsed.seenCutscenes) ? parsed.seenCutscenes.filter((id): id is string => typeof id === 'string') : [];
    return { seenRocket: parsed.seenRocket === true, seenCutscenes: seen };
  } catch {
    return { seenRocket: false, seenCutscenes: [] };
  }
}

export function saveProgress(storage: SaveStorage | undefined, progress: Progress): void {
  try {
    storage?.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Blocked storage: the cinematic just stays unskippable.
  }
}
