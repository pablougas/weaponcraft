import type { PlayerId, WorldState, WorldTime } from '../sim';
import { hashFlags } from './url-flags';

/** App-shell state (not part of the sim). */
export interface ShellState {
  screen: 'loading' | 'title' | 'playing' | 'error';
  pointerLocked: boolean;
  physicsReady: boolean;
}

/** What `wc.getState()` returns: a detached, serialized copy. */
export interface TestState extends ShellState {
  localPlayerId: PlayerId | null;
  world: WorldState | null;
  time: WorldTime | null;
  devMenuOpen: boolean;
}

/**
 * Deterministic test API for Playwright (see CLAUDE.md). `freeze`, `setTime`,
 * `snapCam` and `setSeed` arrive in M2; `face` and `completeTutorialStep` with
 * the systems they drive.
 */
export interface TestApi {
  /** Resolves once the scene is built and a frame has been rendered. */
  ready(): Promise<void>;
  /** A serialized copy of the current state (safe to mutate). */
  getState(): TestState;
  /** Runs `ticks` sim ticks immediately, then returns the new state. */
  step(ticks?: number): TestState;
}

declare global {
  interface Window {
    wc?: TestApi;
  }
}

export function testApiEnabled(): boolean {
  return import.meta.env.DEV || hashFlags().has('test');
}

export function devMenuEnabled(): boolean {
  return import.meta.env.DEV || hashFlags().has('dev');
}

export function installTestApi(api: TestApi): void {
  if (!testApiEnabled()) return;
  window.wc = Object.freeze(api);
}
