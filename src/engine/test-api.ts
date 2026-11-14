import { hashFlags } from './url-flags';

/** Plain-data snapshot of the app shell, returned by `wc.getState()`. */
export interface ShellState {
  screen: 'loading' | 'title' | 'playing' | 'error';
  pointerLocked: boolean;
  physicsReady: boolean;
}

/**
 * Deterministic test API for Playwright (see CLAUDE.md). M0 is a stub with
 * `ready()` and `getState()`; `freeze`, `step`, `setTime`, `snapCam`,
 * `setSeed`, `face` and `completeTutorialStep` arrive with the milestones that
 * build those systems.
 */
export interface TestApi {
  /** Resolves once the scene is built and a frame has been rendered. */
  ready(): Promise<void>;
  /** A serialized copy of the current state (safe to mutate). */
  getState(): ShellState;
}

declare global {
  interface Window {
    wc?: TestApi;
  }
}

export function testApiEnabled(): boolean {
  return import.meta.env.DEV || hashFlags().has('test');
}

export function installTestApi(api: TestApi): void {
  if (!testApiEnabled()) return;
  window.wc = Object.freeze(api);
}
