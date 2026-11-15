import type { PlayerId, WorldState, WorldTime } from '../sim';
import type { CameraPresetId } from '../view/cameras';
import type { Expression } from '../view/entity-model';
import type { QualityPreset, Settings } from './settings';
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
  settingsOpen: boolean;
  settings: Settings | null;
  /** The quality preset actually in use (what "auto" resolved to). */
  quality: QualityPreset | null;
  /** Seconds the view clock is frozen at, or null if running. */
  frozenAt: number | null;
  /** How far the cinematic camera is shaken this frame, metres (0 with Reduce motion). */
  cameraShake: number;
}

/**
 * Deterministic test API for Playwright (see CLAUDE.md). Mutators resolve
 * after the next rendered frame, so a screenshot taken afterwards shows the
 * change.
 */
export interface TestApi {
  /** Resolves once the scene is built and a frame has been rendered. */
  ready(): Promise<void>;
  /** A serialized copy of the current state (safe to mutate). */
  getState(): TestState;
  /** Runs `ticks` sim ticks immediately, then returns the new state. */
  step(ticks?: number): TestState;
  /** Stops the real-time clock: animation shows `timeSeconds` and the sim stops ticking on its own. */
  freeze(timeSeconds: number): Promise<void>;
  /** Overrides the time of day (0 = midnight, 0.5 = noon, 0.7 = golden hour). */
  setTime(dayFraction: number): Promise<void>;
  /** Moves the camera to a preset shot: 'vista', 'hero' or 'wide'. */
  snapCam(presetId: CameraPresetId): Promise<void>;
  /** Starts a new game with this world seed. */
  setSeed(seed: number): Promise<void>;
  /** Forces the local god's face ('neutral' | 'determined' | 'happy' | 'hurt'); null for automatic. */
  face(expression: Expression | null): Promise<void>;
  /** Marks a prologue tutorial step done ('move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'). */
  completeTutorialStep(stepId: string): Promise<void>;
  /** Moves the local god onto the ground at (x, z) via a `dev:teleport` intent, camera behind it. */
  teleport(x: number, z: number, rotationY?: number): Promise<void>;
}

declare global {
  interface Window {
    wc?: TestApi;
  }
}

export function testApiEnabled(): boolean {
  return import.meta.env.DEV || hashFlags().has('test');
}

/** Automated test run (`#test`): skip timing-dependent behaviour like the auto-quality probe. */
export function isTestRun(): boolean {
  return hashFlags().has('test');
}

export function devMenuEnabled(): boolean {
  return import.meta.env.DEV || hashFlags().has('dev');
}

export function installTestApi(api: TestApi): void {
  if (!testApiEnabled()) return;
  window.wc = Object.freeze(api);
}
