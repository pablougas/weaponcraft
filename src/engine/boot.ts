import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import * as THREE from 'three';
import '../ui/ui.css';
import { cloneWorld, type Entity } from '../sim';
import { createDevMenu, type DevMenu } from '../ui/dev-menu';
import { createHud } from '../ui/hud';
import { hideLoadingScreen, setLoadingText, showFatalError } from '../ui/loading-screen';
import { createSettingsMenu, type SettingsMenu } from '../ui/settings-menu';
import { showTitleScreen } from '../ui/title-screen';
import { CameraRig } from '../view/camera-rig';
import { LightningEffects } from '../view/effects/lightning';
import type { ModelFrame } from '../view/entity-model';
import { EntityViews, preloadModels } from '../view/entity-views';
import { Interpolator } from '../view/interpolation';
import { createWorldView, type WorldView } from '../view/world-view';
import { unlockAudio } from './audio';
import { InputController } from './input';
import { InputMap } from './input-map';
import { FixedStepLoop } from './loop';
import { loadPhysics } from './physics';
import { requestPointerLockSafely } from './pointer-lock';
import { createFullWindowRenderer, type FullWindowRenderer } from './renderer';
import { browserStorage } from './save';
import { openSession, randomSeed, type Session } from './session';
import { defaultSettings, pickAutoQuality, QUALITY_PRESETS, SettingsStore, type QualityPreset } from './settings';
import { devMenuEnabled, installTestApi, isTestRun, type ShellState, type TestState } from './test-api';

/** Autosave interval while the game is open. */
const AUTOSAVE_MS = 10_000;
/** Auto-quality probe: skip warm-up frames, then average this many. */
const PROBE_WARMUP_FRAMES = 20;
const PROBE_FRAMES = 90;

/** Lets the browser paint (e.g. new loading text) before heavy synchronous work. */
const nextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

/** Waits for the bundled title font so the first frames (and screenshots) don't swap fonts. */
async function loadFonts(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 20px Cinzel'), document.fonts.load('600 20px Cinzel')]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // The serif fallback is fine.
  }
}

/**
 * Starts the 3D game: loading screen → renderer + physics + session + meadow
 * + models → first frame → click-to-start title screen → playing.
 */
export async function boot(): Promise<void> {
  const shell: ShellState = { screen: 'loading', pointerLocked: false, physicsReady: false };
  let session: Session | undefined;
  let devMenu: DevMenu | undefined;
  let settingsMenu: SettingsMenu | undefined;
  let worldView: WorldView | undefined;
  let entityViews: EntityViews | undefined;
  const loop = new FixedStepLoop();
  const interpolator = new Interpolator();
  const cameraRig = new CameraRig();
  /** 'preset' while a fixed shot is shown (title screen, tests); 'follow' during play. */
  let cameraMode: 'preset' | 'follow' = 'preset';
  const storage = browserStorage();
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const settings = new SettingsStore(storage, defaultSettings(prefersReducedMotion));

  // Quality: "auto" starts at Medium and may change once after a short FPS probe.
  let autoQuality: QualityPreset = 'medium';
  let probing = !isTestRun();
  const probeFrames: number[] = [];
  const activeQuality = (): QualityPreset => {
    const chosen = settings.get().quality;
    return chosen === 'auto' ? autoQuality : chosen;
  };

  // View clock: real time unless a test froze it.
  let frozenAt: number | null = null;
  let viewSeconds = 0;
  /** While frozen, only re-render when something visible changed. */
  let dirty = true;
  const frameWaiters: Array<() => void> = [];
  const nextFrame = () => new Promise<void>((resolve) => frameWaiters.push(resolve));

  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => undefined); // Failures are shown on screen; avoid an unhandled rejection.

  let input: InputController | undefined;
  /** One sim tick: gather input intents, remember positions for interpolation, step. */
  const tick = () => {
    if (!session) return;
    if (input) for (const intent of input.takeIntents(cameraRig.yaw)) session.sendIntent(intent);
    interpolator.capture(session.world);
    session.step();
  };

  const localHero = (): Entity | undefined => {
    const id = session?.world.players[session.localPlayerId]?.entityId;
    return id ? session?.world.entities[id] : undefined;
  };

  const getState = (): TestState => ({
    ...structuredClone(shell),
    localPlayerId: session?.localPlayerId ?? null,
    world: session ? cloneWorld(session.world) : null,
    time: session ? session.worldTime() : null,
    devMenuOpen: devMenu?.isOpen ?? false,
    settingsOpen: settingsMenu?.isOpen ?? false,
    settings: settings.get(),
    quality: worldView ? activeQuality() : null,
    frozenAt,
  });

  installTestApi({
    ready: () => ready,
    getState,
    step(ticks = 1) {
      for (let i = 0; i < ticks; i += 1) {
        tick();
        loop.recordTick(performance.now());
      }
      dirty = true;
      return getState();
    },
    freeze(timeSeconds) {
      frozenAt = timeSeconds;
      probing = false;
      dirty = true;
      return nextFrame();
    },
    setTime(dayFraction) {
      if (session) session.timeOverride = dayFraction;
      dirty = true;
      return nextFrame();
    },
    snapCam(presetId) {
      cameraMode = 'preset';
      worldView?.snapCam(presetId);
      dirty = true;
      return nextFrame();
    },
    setSeed(seed) {
      session?.newGame(seed);
      dirty = true;
      return nextFrame();
    },
    face(expression) {
      entityViews?.setFaceOverride(expression);
      dirty = true;
      return nextFrame();
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

  let rapier;
  try {
    setLoadingText('Waking the forge…');
    [rapier] = await Promise.all([loadPhysics(), loadFonts()]);
    shell.physicsReady = true;
  } catch (error) {
    fail('Could not start physics', 'Try reloading the page.', error);
    return;
  }

  const opened = openSession(storage, randomSeed);
  const activeSession = opened.session;
  session = activeSession;
  activeSession.attachPhysics(rapier);
  const newGame = () => activeSession.newGame(randomSeed());

  setLoadingText('Forging the world…');
  await nextPaint();
  let meadow: WorldView;
  let views: EntityViews;
  try {
    const factories = await preloadModels();
    meadow = createWorldView(view.renderer);
    views = new EntityViews(meadow.scene, meadow.look, factories);
  } catch (error) {
    fail('Could not build the world', 'Try reloading the page, or lower the quality in another browser.', error);
    return;
  }
  worldView = meadow;
  entityViews = views;
  const lightning = new LightningEffects(meadow.scene);
  view.onResize((width, height) => {
    meadow.resize(width, height);
    dirty = true;
  });

  const hud = createHud(document.body);

  const applySettings = () => {
    const current = settings.get();
    meadow.setEffects(current.effects);
    meadow.setReduceMotion(current.reduceMotion);
    meadow.setQuality(QUALITY_PRESETS[activeQuality()]);
    activeSession.timeLock = current.timeOfDay;
    document.documentElement.classList.toggle('wc-reduce-motion', current.reduceMotion);
    dirty = true;
  };
  settings.subscribe(applySettings);

  // Sim events drive one-off animation (hits, bolts). They carry IDs and plain data only.
  let frame: ModelFrame = { time: 0, dt: 0, world: activeSession.world, reduceMotion: false };
  activeSession.bus.onAny((event) => {
    views.handleEvent(event, frame);
    if (event.type === 'ability:cast' && event.points.length > 1) {
      const points = event.points.map((p) => ({ ...p }));
      const tip = views.anchor(event.casterId, 'spearTip', new THREE.Vector3());
      if (tip) points[0] = { x: tip.x, y: tip.y, z: tip.z };
      lightning.spawn(points, event.tick, settings.get().reduceMotion);
    }
  });
  activeSession.onReset(() => {
    interpolator.clear();
    loop.reset();
    views.clear();
    lightning.clear();
    cameraRig.reset();
    const hero = localHero();
    if (hero) cameraRig.faceHeading(hero.rotationY);
  });

  // Pointer lock: requested on clicks (user gestures); losing it while playing pauses into settings.
  const requestLock = () => {
    if (shell.screen !== 'playing') return;
    void requestPointerLockSafely(view.canvas);
  };
  let expectingUnlock = false;
  let settingsOpenedAt = -Infinity;
  const openSettings = () => {
    if (!settingsMenu || settingsMenu.isOpen || shell.screen !== 'playing') return;
    settingsOpenedAt = performance.now();
    settingsMenu.open();
    if (document.pointerLockElement) {
      expectingUnlock = true;
      document.exitPointerLock();
    }
  };

  settingsMenu = createSettingsMenu(document.body, {
    store: settings,
    onResume: requestLock,
    onNewGame: newGame,
  });
  settingsMenu.setAutoQuality(autoQuality);

  const inputMap = new InputMap();
  const gameplayInput = () => shell.screen === 'playing' && !settingsMenu?.isOpen && !devMenu?.isOpen;
  input = new InputController(inputMap, view.canvas, gameplayInput);
  if (devMenuEnabled()) {
    devMenu = createDevMenu(document.body, activeSession, settings, loop, newGame);
  }
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (devMenu && inputMap.matches('devMenu', event)) {
      event.preventDefault();
      devMenu.toggle();
      if (devMenu.isOpen && document.pointerLockElement) {
        expectingUnlock = true;
        document.exitPointerLock();
      }
      return;
    }
    if (inputMap.matches('settings', event) && shell.screen === 'playing') {
      event.preventDefault();
      if (!settingsMenu?.isOpen) {
        openSettings();
      } else if (performance.now() - settingsOpenedAt > 300) {
        // Esc isn't a user gesture for pointer lock; click the game to recapture the mouse.
        settingsMenu.close();
      }
    }
  });

  // Mouse look: pointer-lock movement, or drag-to-orbit when the lock was refused (itch.io iframe).
  let dragging = false;
  view.canvas.addEventListener('pointerdown', (event) => {
    if (!document.pointerLockElement) dragging = true;
    if (event.pointerType !== 'mouse') view.canvas.setPointerCapture(event.pointerId);
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!gameplayInput() || cameraMode !== 'follow') return;
    if (document.pointerLockElement === view.canvas || dragging) {
      const current = settings.get();
      cameraRig.look(event.movementX, event.movementY, current.mouseSensitivity, current.invertY);
    }
  });
  view.canvas.addEventListener('wheel', (event) => {
    if (gameplayInput()) cameraRig.zoom(event.deltaY);
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    shell.pointerLocked = document.pointerLockElement === view.canvas;
    if (shell.pointerLocked) return;
    if (expectingUnlock) {
      expectingUnlock = false;
      return;
    }
    // The browser released the mouse (Esc, focus lost): pause into the settings menu.
    if (!devMenu?.isOpen) openSettings();
  });
  // The itch.io iframe losing focus also pauses, which doubles as "click to resume".
  window.addEventListener('blur', () => {
    if (!devMenu?.isOpen) openSettings();
  });
  view.canvas.addEventListener('click', () => {
    if (!settingsMenu?.isOpen && !document.pointerLockElement) requestLock();
  });

  // Save regularly and whenever the page is hidden or closed.
  window.setInterval(() => {
    if (shell.screen === 'playing') activeSession.save();
  }, AUTOSAVE_MS);
  window.addEventListener('pagehide', () => activeSession.save());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') activeSession.save();
  });

  const finishProbe = () => {
    probing = false;
    const frames = probeFrames.slice(PROBE_WARMUP_FRAMES);
    const averageMs = frames.reduce((sum, ms) => sum + ms, 0) / Math.max(1, frames.length);
    autoQuality = pickAutoQuality(1000 / Math.max(1, averageMs));
    settingsMenu?.setAutoQuality(autoQuality);
    if (settings.get().quality === 'auto') applySettings();
  };

  const lockPoint = new THREE.Vector3();
  const heroPoint = { x: 0, y: 0, z: 0 };
  let firstFrame = true;
  let lastFrameMs: number | undefined;
  let alpha = 0;
  view.renderer.setAnimationLoop((timeMs) => {
    const frameMs = lastFrameMs === undefined ? 0 : timeMs - lastFrameMs;
    lastFrameMs = timeMs;
    const frozen = frozenAt !== null;

    if (!frozen) {
      viewSeconds = timeMs / 1000;
      // The sim runs at a fixed 30 Hz; alpha is how far we are toward the next tick.
      alpha = loop.advance(frameMs, timeMs, tick);
    } else {
      viewSeconds = frozenAt ?? 0;
      alpha = 1;
    }
    if (probing && frameMs > 0) {
      probeFrames.push(frameMs);
      if (probeFrames.length >= PROBE_WARMUP_FRAMES + PROBE_FRAMES) finishProbe();
    }

    if (!frozen || dirty) {
      dirty = false;
      const dt = frozen ? 0 : Math.min(0.1, frameMs / 1000);
      const world = activeSession.world;
      frame = { time: viewSeconds, dt, world, reduceMotion: settings.get().reduceMotion };
      views.sync(world, interpolator, alpha, frame);
      lightning.update(dt);

      const hero = localHero();
      if (cameraMode === 'follow' && hero) {
        interpolator.position(world, hero.id, alpha, heroPoint);
        const lock = hero.hero?.lockTarget ? world.entities[hero.hero.lockTarget] : undefined;
        cameraRig.update(meadow.camera, heroPoint, dt, lock ? lockPoint.set(lock.position.x, lock.position.y, lock.position.z) : null);
      }
      hud.update(world, hero?.id ?? null);

      meadow.update(viewSeconds, activeSession.worldTime().dayFraction);
      meadow.render();
    }
    devMenu?.update(timeMs);
    for (const resolve of frameWaiters.splice(0)) resolve();

    if (!firstFrame) return;
    firstFrame = false;
    hideLoadingScreen();
    shell.screen = 'title';
    showTitleScreen(document.body, {
      resumed: opened.resumed,
      onStart(isNewGame) {
        // Both calls need the click's user gesture, so make them before any await.
        void unlockAudio();
        if (isNewGame) newGame();
        shell.screen = 'playing';
        // Hand the camera from the title shot to the follow camera behind the god.
        const hero = localHero();
        if (hero) cameraRig.faceHeading(hero.rotationY);
        cameraRig.reset();
        cameraMode = 'follow';
        hud.setVisible(true);
        requestLock();
        view.canvas.focus();
      },
    });
    resolveReady();
  });
}
