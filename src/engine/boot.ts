import '../ui/ui.css';
import { hideLoadingScreen, setLoadingText, showFatalError } from '../ui/loading-screen';
import { showTitleScreen } from '../ui/title-screen';
import { createPlaceholderScene } from '../view/placeholder-scene';
import { unlockAudio } from './audio';
import { loadPhysics } from './physics';
import { requestPointerLockSafely } from './pointer-lock';
import { createFullWindowRenderer, type FullWindowRenderer } from './renderer';
import { installTestApi, type ShellState } from './test-api';

/**
 * Starts the 3D game: loading screen → renderer + physics → first frame →
 * click-to-start title screen → playing.
 */
export async function boot(): Promise<void> {
  const state: ShellState = { screen: 'loading', pointerLocked: false, physicsReady: false };

  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => undefined); // Failures are shown on screen; avoid an unhandled rejection.

  installTestApi({
    ready: () => ready,
    getState: () => structuredClone(state),
  });

  const fail = (title: string, detail: string, error: unknown) => {
    state.screen = 'error';
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
    state.physicsReady = true;
  } catch (error) {
    fail('Could not start physics', 'Try reloading the page.', error);
    return;
  }

  setLoadingText('Forging the world…');
  const placeholder = createPlaceholderScene();
  view.onResize((width, height) => placeholder.resize(width, height));

  document.addEventListener('pointerlockchange', () => {
    state.pointerLocked = document.pointerLockElement === view.canvas;
  });

  let firstFrame = true;
  view.renderer.setAnimationLoop((timeMs) => {
    placeholder.update(timeMs);
    view.renderer.render(placeholder.scene, placeholder.camera);
    if (!firstFrame) return;
    firstFrame = false;
    hideLoadingScreen();
    state.screen = 'title';
    showTitleScreen(document.body, () => {
      // Both calls need the click's user gesture, so make them before any await.
      void unlockAudio();
      void requestPointerLockSafely(view.canvas);
      state.screen = 'playing';
      view.canvas.focus();
    });
    resolveReady();
  });
}
