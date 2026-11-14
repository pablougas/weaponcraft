import '../ui/ui.css';
import { cloneWorld } from '../sim';
import { createDevMenu, type DevMenu } from '../ui/dev-menu';
import { hideLoadingScreen, setLoadingText, showFatalError } from '../ui/loading-screen';
import { showTitleScreen } from '../ui/title-screen';
import { Interpolator } from '../view/interpolation';
import { createPlaceholderScene } from '../view/placeholder-scene';
import { unlockAudio } from './audio';
import { InputMap } from './input-map';
import { FixedStepLoop } from './loop';
import { loadPhysics } from './physics';
import { requestPointerLockSafely } from './pointer-lock';
import { createFullWindowRenderer, type FullWindowRenderer } from './renderer';
import { browserStorage } from './save';
import { openSession, randomSeed, type Session } from './session';
import { devMenuEnabled, installTestApi, type ShellState, type TestState } from './test-api';

/** Autosave interval while the game is open. */
const AUTOSAVE_MS = 10_000;

/**
 * Starts the 3D game: loading screen → renderer + physics + session → first
 * frame → click-to-start title screen → playing.
 */
export async function boot(): Promise<void> {
  const shell: ShellState = { screen: 'loading', pointerLocked: false, physicsReady: false };
  let session: Session | undefined;
  let devMenu: DevMenu | undefined;
  const loop = new FixedStepLoop();
  const interpolator = new Interpolator();

  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => undefined); // Failures are shown on screen; avoid an unhandled rejection.

  /** One sim tick, with the previous positions captured for interpolation. */
  const tick = () => {
    if (!session) return;
    interpolator.capture(session.world);
    session.step();
  };

  const getState = (): TestState => ({
    ...structuredClone(shell),
    localPlayerId: session?.localPlayerId ?? null,
    world: session ? cloneWorld(session.world) : null,
    time: session ? session.worldTime() : null,
    devMenuOpen: devMenu?.isOpen ?? false,
  });

  installTestApi({
    ready: () => ready,
    getState,
    step(ticks = 1) {
      for (let i = 0; i < ticks; i += 1) {
        tick();
        loop.recordTick(performance.now());
      }
      return getState();
    },
  });

  const fail = (title: string, detail: string, error: unknown) => {
    shell.screen = 'error';
    showFatalError(title, detail);
    rejectReady(error);
    console.error(error);
  };

  let view: FullWindowRenderer;
  try {
    view = createFullWindowRenderer(document.body);
  } catch (error) {
    fail('WebGL unavailable', 'Weaponcraft needs a browser with WebGL 2 enabled.', error);
    return;
  }

  try {
    setLoadingText('Waking the forge…');
    await loadPhysics();
    shell.physicsReady = true;
  } catch (error) {
    fail('Could not start physics', 'Try reloading the page.', error);
    return;
  }

  setLoadingText('Forging the world…');
  const storage = browserStorage();
  const opened = openSession(storage, randomSeed);
  const activeSession = opened.session;
  session = activeSession;
  activeSession.onReset(() => {
    interpolator.clear();
    loop.reset();
  });
  const newGame = () => activeSession.newGame(randomSeed());

  const placeholder = createPlaceholderScene();
  view.onResize((width, height) => placeholder.resize(width, height));

  // Input: keys are looked up through the rebindable input map.
  const input = new InputMap();
  if (devMenuEnabled()) {
    devMenu = createDevMenu(document.body, activeSession, loop, newGame);
  }
  window.addEventListener('keydown', (event) => {
    if (devMenu && input.matches('devMenu', event) && !event.repeat) {
      event.preventDefault();
      devMenu.toggle();
      if (devMenu.isOpen && document.pointerLockElement) document.exitPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    shell.pointerLocked = document.pointerLockElement === view.canvas;
  });

  // Save regularly and whenever the page is hidden or closed.
  window.setInterval(() => {
    if (shell.screen === 'playing') activeSession.save();
  }, AUTOSAVE_MS);
  window.addEventListener('pagehide', () => activeSession.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') activeSession.save();
  });

  let firstFrame = true;
  let lastFrameMs: number | undefined;
  view.renderer.setAnimationLoop((timeMs) => {
    const frameMs = lastFrameMs === undefined ? 0 : timeMs - lastFrameMs;
    lastFrameMs = timeMs;
    // The sim runs at a fixed 30 Hz. advance() returns alpha (how far we are
    // toward the next tick); entity views will interpolate with it from M3.
    loop.advance(frameMs, timeMs, tick);

    placeholder.update(timeMs);
    view.renderer.render(placeholder.scene, placeholder.camera);
    devMenu?.update(timeMs);

    if (!firstFrame) return;
    firstFrame = false;
    hideLoadingScreen();
    shell.screen = 'title';
    showTitleScreen(document.body, {
      resumed: opened.resumed,
      onStart(isNewGame) {
        // Both calls need the click's user gesture, so make them before any await.
        void unlockAudio();
        void requestPointerLockSafely(view.canvas);
        if (isNewGame) newGame();
        shell.screen = 'playing';
        view.canvas.focus();
      },
    });
    resolveReady();
  });
}
