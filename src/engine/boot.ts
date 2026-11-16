import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import * as THREE from 'three';
import '../ui/ui.css';
import { cloneWorld, MEADOW_RADIUS, type Entity, type IntentInput } from '../sim';
import { godDef, weaponDef } from '../sim/defs';
import { createDevMenu, type DevMenu } from '../ui/dev-menu';
import { createAltarScreen } from '../ui/altar';
import { createCaptions } from '../ui/captions';
import { createTutorialPanel } from '../ui/tutorial';
import { ROCKET_CAPTIONS, rocketFrame, type CameraPose } from '../view/cinematics/rocket';
import { DESCENT_CAPTIONS, descentFrame } from '../view/cinematics/descent';
import { FREED_CAPTION_SECONDS, FREED_CAPTIONS, freedFrame } from '../view/cinematics/freed';
import { WARDEN_CAPTIONS, wardenFrame } from '../view/cinematics/warden';
import { ShadowPortal } from '../view/effects/portal';
import { ShadowEffects } from '../view/effects/shadow';
import { createMinimap } from '../ui/minimap';
import { descentTicks } from '../sim/cutscenes/descent';
import { findPoseidon, FREED_ID, freedPoints, freedTicks } from '../sim/cutscenes/freed';
import { WARDEN_ID, wardenTicks } from '../sim/cutscenes/warden';
import { findWarden } from '../sim/systems/warden';
import { findMech } from '../sim/systems/mech';
import { GROTTO, groundAt, regionOf } from '../sim/regions';
import { CERBERUS_HOUND, GATES, TUNNEL } from '../sim/terrain/underworld';
import { restPose } from '../sim/systems/rest';
import { rocketTicks } from '../sim/cutscenes/rocket';
import { DAY_MS } from '../sim/time';
import { loadProgress, saveProgress } from './progress';
import { createCodex } from '../ui/codex';
import { createInventory } from '../ui/inventory';
import { WorldLabels } from '../ui/world-labels';
import { createHud } from '../ui/hud';
import { hideLoadingScreen, setLoadingText, showFatalError } from '../ui/loading-screen';
import { createSettingsMenu, type SettingsMenu } from '../ui/settings-menu';
import { showTitleScreen } from '../ui/title-screen';
import { CAMERA_TURN_SPEED, CameraRig } from '../view/camera-rig';
import { DustEffects } from '../view/effects/dust';
import { LightningEffects } from '../view/effects/lightning';
import { SkyStrikeEffects } from '../view/effects/sky-strike';
import type { ModelFrame } from '../view/entity-model';
import { EntityViews, preloadModels } from '../view/entity-views';
import { Interpolator } from '../view/interpolation';
import { createWorldView, type WorldView } from '../view/world-view';
import { setVolumes, unlockAudio } from './audio';
import { Music } from './music';
import { GodVoices } from './voices';
import { InputController } from './input';
import { InputMap, keyLabel } from './input-map';
import { FixedStepLoop } from './loop';
import { loadPhysics } from './physics';
import { requestPointerLockSafely } from './pointer-lock';
import { createFullWindowRenderer, type FullWindowRenderer } from './renderer';
import { browserStorage } from './save';
import { Sfx } from './sfx';
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
  /** Camera pose when the rocket cinematic began (it eases from there), and the latest shake (tests). */
  let cinematicStart: CameraPose | null = null;
  let cinematicId: string | null = null;
  let cameraShake = 0;
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
    cameraShake,
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
      const god = localHero();
      if (presetId === 'closeup' && god && worldView) {
        // In front of the god's face, a little to one side (like the 'hero' shot, but anywhere).
        const s = (god.body?.height ?? 1.9) / 1.9;
        const f = { x: Math.sin(god.rotationY), z: Math.cos(god.rotationY) };
        const p = god.position;
        worldView.camera.position.set(p.x + f.x * 1.8 + f.z * 0.5, p.y + 1.95 * s, p.z + f.z * 1.8 - f.x * 0.5);
        worldView.camera.lookAt(p.x, p.y + 1.82 * s, p.z);
      } else if (presetId === 'overlook' && god && worldView) {
        // High behind the god, looking out over what's ahead (review shots of the fields).
        const f = { x: Math.sin(god.rotationY), z: Math.cos(god.rotationY) };
        const p = god.position;
        worldView.camera.position.set(p.x - f.x * 9, p.y + 8, p.z - f.z * 9);
        worldView.camera.lookAt(p.x + f.x * 14, p.y, p.z + f.z * 14);
      } else if (presetId === 'mech' && god && worldView) {
        // Behind and above the god, framing Cerberus Mk. II (M7 review shots).
        const mech = findMech(activeSession.world);
        const p = god.position;
        const m = mech?.position ?? p;
        const d = { x: m.x - p.x, z: m.z - p.z };
        const len = Math.hypot(d.x, d.z) || 1;
        worldView.camera.position.set(p.x - (d.x / len) * 14 + (d.z / len) * 6, p.y + 11, p.z - (d.z / len) * 14 - (d.x / len) * 6);
        worldView.camera.lookAt(m.x, m.y + 9, m.z);
      } else if (presetId === 'side' && god && worldView) {
        // Front three-quarter, a little above the crown: what floats over the god (Shadow Daggers).
        const f = { x: Math.sin(god.rotationY), z: Math.cos(god.rotationY) };
        const p = god.position;
        worldView.camera.position.set(p.x + f.x * 3 + f.z * 3.2, p.y + 3.1, p.z + f.z * 3 - f.x * 3.2);
        worldView.camera.lookAt(p.x + f.x * 0.4, p.y + 2.1, p.z + f.z * 0.4);
      } else if (presetId !== 'closeup' && presetId !== 'overlook' && presetId !== 'mech' && presetId !== 'side') {
        worldView?.snapCam(presetId);
      }
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
    completeTutorialStep(stepId) {
      if (!session) return nextFrame();
      session.sendIntent({ type: 'dev:tutorial', stepId });
      tick();
      loop.recordTick(performance.now());
      dirty = true;
      return nextFrame();
    },
    breakBarricade() {
      if (!session) return nextFrame();
      session.sendIntent({ type: 'dev:breakBarricade' });
      tick();
      loop.recordTick(performance.now());
      dirty = true;
      return nextFrame();
    },
    weakenMech(fraction, target) {
      if (!session) return nextFrame();
      session.sendIntent({ type: 'dev:weakenMech', fraction, target });
      tick();
      loop.recordTick(performance.now());
      dirty = true;
      return nextFrame();
    },
    teleport(x, z, rotationY) {
      if (!session) return nextFrame();
      session.sendIntent({ type: 'dev:teleport', x, z, rotationY });
      tick();
      loop.recordTick(performance.now());
      interpolator.capture(session.world);
      const hero = localHero();
      if (hero) cameraRig.faceHeading(hero.rotationY);
      cameraRig.reset();
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
  const shadow = new ShadowEffects(meadow.scene);
  const skyStrikes = new SkyStrikeEffects(meadow.scene, lightning);
  /** When the player last turned the camera themselves (mouse or , .); auto-follow waits after it. */
  let lastCameraInputAt = -Infinity;
  view.onResize((width, height) => {
    meadow.resize(width, height);
    dirty = true;
  });

  const hud = createHud(document.body);
  const voices = new GodVoices();
  const captions = createCaptions(document.body, (text) => voices.say(text));
  const progress = loadProgress(storage);
  const dust = new DustEffects(meadow.scene);
  const sfx = new Sfx(
    (entityId) => !!entityId && entityId === localHero()?.id,
    (text) => captions.show(text),
    (playerId) => playerId === activeSession.localPlayerId,
  );
  const music = new Music();
  /** Footsteps: metres walked since the last step, and where the god was last frame. */
  let strideLeft = 0;
  let lastStepPos: { x: number; z: number } | null = null;
  /** The Cerberus Mk. II fight is still to come (M7): reaching the Gates ends the demo on Hades's line, once per session. */
  let gatesSeen = false;
  /** Auto-follow waits this long after the player last turned the camera. */
  const AUTO_FOLLOW_DELAY_MS = 600;

  const applySettings = () => {
    const current = settings.get();
    meadow.setEffects(current.effects);
    meadow.setReduceMotion(current.reduceMotion);
    meadow.setQuality(QUALITY_PRESETS[activeQuality()]);
    activeSession.timeLock = current.timeOfDay;
    setVolumes(current.volume);
    document.documentElement.classList.toggle('wc-reduce-motion', current.reduceMotion);
    dirty = true;
  };
  settings.subscribe(applySettings);

  // Sim events drive one-off animation (hits, bolts). They carry IDs and plain data only.
  let frame: ModelFrame = { time: 0, dt: 0, world: activeSession.world, reduceMotion: false };
  activeSession.bus.onAny((event) => {
    views.handleEvent(event, frame);
    sfx.handle(event);
    if (event.type === 'cutscene:beat' && ROCKET_CAPTIONS[event.beat]) captions.show(ROCKET_CAPTIONS[event.beat], event.beat === 'pan' ? 5 : 3.5);
    if (event.type === 'cutscene:beat' && event.cutsceneId === 'descent' && DESCENT_CAPTIONS[event.beat]) {
      // Long enough to read comfortably (the scene is paced to match).
      captions.show(DESCENT_CAPTIONS[event.beat], event.beat === 'dispatch' ? 8 : 5.5);
    }
    if (event.type === 'cutscene:end') {
      // A skipped scene takes its lines with it.
      if (event.skipped) voices.stop();
      // This browser remembers what it has seen, so later games may skip it.
      if (event.cutsceneId === 'rocket') progress.seenRocket = true;
      progress.seenCutscenes = [...new Set([...(progress.seenCutscenes ?? []), event.cutsceneId])];
      saveProgress(storage, progress);
    }
    if (event.type === 'objective:set' && event.objectiveId === 'find-and-free-cerberus') captions.show('Find and free Cerberus.', 5);
    if (event.type === 'dispatch:read') captions.show(DESCENT_CAPTIONS.dispatch, 6);
    if (event.type === 'barricade:examined') captions.show('The humans barred the tunnel deeper into the Underworld. Break it down.', 4);
    if (event.type === 'soldier:alarm') {
      captions.show(event.kind === 'sentry' ? '[A sentry’s horn sounds. Soldiers are coming.]'
        : event.kind === 'captain' ? '[Sentry Captain, bellowing] “To arms! Take the god!”'
          : '[Soldier, shouting] “Over there!”', 3);
    }
    if (event.type === 'soldier:rout') captions.show('[The captain falls. His sentries break and run!]', 3);
    // Cerberus Mk. II (M7).
    if (event.type === 'mech:alarm') captions.show('[Cerberus Mk. II roars and turns toward you]', 3);
    if (event.type === 'mech:windup') {
      captions.show(event.kind === 'stomp' ? '[The Mk. II rears up. Get clear!]'
        : event.kind === 'charge' ? '[The Mk. II lowers its heads and paws the ground. It\u2019s going to charge!]'
          : '[Its three heads glow with stolen fire]', 2.5);
    }
    if (event.type === 'mech:down') captions.show('[The Mk. II shudders and powers down]', 3);
    if (event.type === 'cutscene:beat' && event.cutsceneId === FREED_ID && FREED_CAPTIONS[event.beat]) captions.show(FREED_CAPTIONS[event.beat], FREED_CAPTION_SECONDS[event.beat] ?? 2.6);
    if (event.type === 'level:reset' && event.entityId === localHero()?.id) {
      voices.stop();
      cameraRig.rearm();
      captions.show(event.reason === 'fell' ? '[You wake at the Refuge. Your enemies have regrouped.]' : '[Back at the Refuge. The level starts over.]', 3.5);
    }
    // The Warden (M7 boss).
    if (event.type === 'cutscene:beat' && event.cutsceneId === WARDEN_ID && WARDEN_CAPTIONS[event.beat]) captions.show(WARDEN_CAPTIONS[event.beat], event.beat === 'roar' ? 3.5 : 2.4);
    if (event.type === 'objective:set' && event.objectiveId === 'defeat-the-warden') captions.show('Defeat the Warden.', 3);
    if (event.type === 'warden:windup' && event.kind === 'leap') captions.show('[The Warden crouches to leap. Move!]', 1.8);
    if (event.type === 'warden:windup' && event.kind === 'dash') captions.show('[The Warden lowers his shoulder]', 1.6);
    if (event.type === 'warden:enraged') captions.show('The Warden: Is that all the gods have left?', 3.5);
    if (event.type === 'warden:defeated') captions.show('[The Warden falls] Hades: The chains, brother. Free him.', 5);
    if (event.type === 'chains:examined' && event.playerId === activeSession.localPlayerId) {
      captions.show(event.reason === 'machine' ? 'The chains feed their machine. Bring the Mk. II down first.'
        : event.reason === 'warden' ? 'The Warden still stands.' : 'Cerberus is free.', 3);
    }
    if (event.type === 'spirit:freed') {
      const key = keyLabel(inputMap.codesFor('spiritAbility')[0] ?? 'KeyE');
      captions.show(`Cerberus's gifts unlocked: ${key} is the Three-Fold Howl for Zeus and Shadow Daggers for Hades.`, 6);
    }
    if (event.type === 'ability:cast' && event.abilityId === 'three-fold-howl' && localHero()?.id === event.casterId) captions.show('[Cerberus howls through you]', 2);
    if (event.type === 'ability:cast' && event.abilityId === 'shadow-daggers' && localHero()?.id === event.casterId) {
      const key = keyLabel(inputMap.codesFor('lockOn')[0] ?? 'Tab');
      captions.show(`[Three shadow daggers circle Hades: ${key} to focus an enemy and they strike]`, 3);
    }
    if (event.type === 'soldier:suspicious') captions.show('[Soldier] “Who’s there?”', 2);
    if (event.type === 'fort:cleared') captions.show('Fort cleared. Its chest is unguarded.', 3.5);
    if (event.type === 'chest:opened') captions.show(event.weaponId ? `Found a weapon in the chest (${weaponDef(event.weaponId).name}).` : 'The chest is empty.', 3.5);
    if (event.type === 'intent:rejected' && event.reason === 'guarded' && event.playerId === activeSession.localPlayerId) captions.show('Soldiers guard this chest. Clear the fort first.', 3);
    if (event.type === 'barricade:broken') captions.show('[The barricade splinters] Hades: The Asphodel Fields. The hound is somewhere past the Gates.', 5);
    if (event.type === 'hero:down') captions.show('Zeus has fallen. He wakes at the Refuge.', 3.5);
    if (event.type === 'npc:talk') {
      captions.show(event.name === 'Poseidon'
        ? 'Poseidon: The tides are turning, brothers. Rest a while; then we find the others.'
        : 'Hades: Cerberus first. Then we take back what is ours.', 4);
    }
    if (event.type === 'objective:set' && event.objectiveId === 'find-the-others') captions.show('Find the others. Survive.', 5);
    if (event.type === 'hero:rested') captions.show('You rest. Health and stamina restored.');
    if (event.type === 'forge:used') captions.show('The Forge is cold. Bring materials from the wider world to craft here.');
    altarScreen.handleEvent(event);
    labels.handleEvent(event, activeSession.world, (id) => !!id && id === localHero()?.id);
    // A final tutorial fusion can start the rocket while its result dialog is
    // open. Dismiss gameplay dialogs immediately so the cinematic is visible
    // from its first frame and the player doesn't need to move or close UI.
    if (event.type === 'cutscene:start') {
      for (const screen of screens) screen.close();
    }
    if (event.type === 'altar:opened' && event.playerId === activeSession.localPlayerId) openScreen(altarScreen);
    const rm = settings.get().reduceMotion;
    if (event.type === 'ability:blink' && event.abilityId === 'shadow-step') {
      shadow.puff(event.from, rm);
      shadow.puff(event.to, rm);
    } else if (event.type === 'ability:blink') {
      // A bolt along the path, one strike down onto the landing spot, and dust where he left.
      const lift = (p: { x: number; y: number; z: number }, h: number) => ({ x: p.x, y: p.y + h, z: p.z });
      lightning.spawn([lift(event.from, 1.1), lift(event.to, 1.1)], event.tick, settings.get().reduceMotion);
      lightning.spawn([lift(event.to, 7), lift(event.to, 0.1)], event.tick + 1, settings.get().reduceMotion);
      dust.spawn(event.from, 0, settings.get().reduceMotion);
    }
    if (event.type === 'hero:dodge') {
      const roller = activeSession.world.entities[event.entityId];
      if (roller) dust.spawn(roller.position, roller.rotationY, settings.get().reduceMotion);
    }
    if (event.type === 'ability:cast' && event.abilityId === 'shadow-dagger' && event.points.length > 1) {
      shadow.dagger(event.points[0], event.points[1], rm);
    } else if (event.type === 'ability:cast' && event.abilityId === 'soul-bolts' && event.points.length > 1) {
      const hand = views.anchor(event.casterId, 'spearTip', new THREE.Vector3());
      shadow.soulBolt(hand ? { x: hand.x, y: hand.y, z: hand.z } : event.points[0], event.points[1], rm);
    } else if (event.type === 'ability:cast' && event.points.length > 1) {
      const points = event.points.map((p) => ({ ...p }));
      // Chain Lightning leaves from the spear tip; the Lightning Fist's arc starts at its target.
      if (event.abilityId === 'chain-lightning') {
        const tip = views.anchor(event.casterId, 'spearTip', new THREE.Vector3());
        if (tip) points[0] = { x: tip.x, y: tip.y, z: tip.z };
      }
      lightning.spawn(points, event.tick, settings.get().reduceMotion);
    }
    if (event.type === 'ability:telegraph' && event.abilityId === 'skull-cage') shadow.cageWarning(event.point, event.radius, event.ticks / 30);
    else if (event.type === 'ability:telegraph') skyStrikes.telegraph(event.point, event.radius, event.ticks / 30);
    if (event.type === 'ability:strike' && event.abilityId === 'skull-cage') shadow.cage(event.point, event.radius, 4, rm);
    else if (event.type === 'ability:strike') skyStrikes.strike(event.point, event.radius, event.tick, settings.get().reduceMotion);
    if (event.type === 'hero:attack' && event.abilityId === 'grasp-of-the-dead') {
      const caster = activeSession.world.entities[event.entityId];
      if (caster) shadow.grasp(caster.position, 3 + 2 * (event.power ?? 0), rm);
    }
    if (event.type === 'party:joined') captions.show(`Hades: I will walk with you, brother. (${keyLabel(inputMap.codesFor('switchCharacter')[0] ?? 'KeyV')} to switch)`, 5);
  });
  activeSession.onReset(() => {
    voices.stop();
    interpolator.clear();
    loop.reset();
    views.clear();
    lightning.clear();
    shadow.clear();
    skyStrikes.clear();
    dust.clear();
    labels.clear();
    for (const screen of screens) screen.close();
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
    onResetLevel: () => activeSession.sendIntent({ type: 'player:resetLevel' }),
  });
  settingsMenu.setAutoQuality(autoQuality);

  const inputMap = new InputMap();
  // Inventory (I), Fusion Altar (F at the altar) and Codex (C).
  const screenDeps = {
    getWorld: () => activeSession.world,
    playerId: activeSession.localPlayerId,
    send: (intent: IntentInput) => activeSession.sendIntent(intent),
    keyFor: (action: 'inventory' | 'codex' | 'interact') => keyLabel(inputMap.codesFor(action)[0] ?? ''),
  };
  const inventoryScreen = createInventory(document.body, screenDeps);
  const altarScreen = createAltarScreen(document.body, screenDeps);
  const codexScreen = createCodex(document.body, screenDeps);
  const screens = [inventoryScreen, altarScreen, codexScreen];
  const openScreen = (screen: (typeof screens)[number]) => {
    for (const other of screens) if (other !== screen) other.close();
    screen.open();
    if (document.pointerLockElement) {
      expectingUnlock = true;
      document.exitPointerLock();
    }
  };
  const anyScreenOpen = () => screens.some((screen) => screen.isOpen);
  const labels = new WorldLabels(document.body, () => keyLabel(inputMap.codesFor('interact')[0] ?? 'KeyF'));
  const gameplayInput = () => shell.screen === 'playing' && !settingsMenu?.isOpen && !devMenu?.isOpen && !anyScreenOpen();
  input = new InputController(inputMap, view.canvas, gameplayInput);
  hud.setBindings(inputMap);
  if (devMenuEnabled()) {
    devMenu = createDevMenu(document.body, activeSession, settings, loop, newGame);
  }
  // A calm black fade for the portal (no flash), and the two shadow portals.
  const fadeOverlay = document.createElement('div');
  fadeOverlay.id = 'wc-fade';
  fadeOverlay.hidden = true;
  document.body.append(fadeOverlay);
  const portalA = new ShadowPortal(meadow.scene);
  const portalB = new ShadowPortal(meadow.scene);
  const minimap = createMinimap(document.body);
  const tutorialPanel = createTutorialPanel(document.body, (action) => keyLabel(inputMap.codesFor(action)[0] ?? ''));
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    // A skippable cinematic: Enter (or Esc) skips it.
    if (activeSession.world.cutscene?.skippable && shell.screen === 'playing' && !settingsMenu?.isOpen
      && (inputMap.matches('skipCutscene', event) || inputMap.matches('settings', event))) {
      event.preventDefault();
      activeSession.sendIntent({ type: 'cutscene:skip' });
      return;
    }
    if (devMenu && inputMap.matches('devMenu', event)) {
      event.preventDefault();
      devMenu.toggle();
      if (devMenu.isOpen && document.pointerLockElement) {
        expectingUnlock = true;
        document.exitPointerLock();
      }
      return;
    }
    if (shell.screen === 'playing' && !settingsMenu?.isOpen) {
      if (inputMap.matches('map', event)) {
        event.preventDefault();
        minimap.toggleFull();
        return;
      }
      for (const [action, screen] of [['inventory', inventoryScreen], ['codex', codexScreen]] as const) {
        if (inputMap.matches(action, event)) {
          event.preventDefault();
          if (screen.isOpen) screen.close();
          else openScreen(screen);
          return;
        }
      }
      // Esc closes an open screen before it opens Settings.
      if (inputMap.matches('settings', event) && anyScreenOpen()) {
        event.preventDefault();
        for (const screen of screens) screen.close();
        settingsOpenedAt = performance.now();
        return;
      }
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
      if (event.movementX !== 0 || event.movementY !== 0) lastCameraInputAt = performance.now();
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
  const followCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
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
      views.sync(world, interpolator, alpha, frame, regionOf(localHero()));
      lightning.update(dt);
      shadow.update(dt);
      skyStrikes.update(dt);
      dust.update(dt);

      const hero = localHero();
      sfx.updateCharge(shell.screen === 'playing' ? hero : undefined, hero ? godDef(hero.defId).chargedMove?.fullChargeTicks ?? 30 : 30);
      // Music follows the local god's region and dips under cinematics.
      music.update(shell.screen === 'playing' && hero ? (regionOf(hero) === 'underworld' ? 'underworld' : 'meadow') : null, !!world.cutscene);
      // A footstep every stride while the god walks on the ground.
      if (hero?.hero && shell.screen === 'playing' && !frozen) {
        const moved = lastStepPos ? Math.hypot(hero.position.x - lastStepPos.x, hero.position.z - lastStepPos.z) : 0;
        lastStepPos = { x: hero.position.x, z: hero.position.z };
        if (hero.hero.grounded && moved > 0 && moved < 5) { // (bigger jumps are teleports)
          strideLeft -= moved;
          if (strideLeft <= 0) {
            const sprinting = hero.hero.sprint;
            strideLeft = sprinting ? 2.2 : 1.5;
            sfx.footstep(regionOf(hero) === 'underworld' ? 'stone' : 'grass', sprinting);
          }
        }
      } else {
        lastStepPos = null;
      }
      if (!gatesSeen && hero && shell.screen === 'playing' && regionOf(hero) === 'underworld' && !world.flags.cerberusFreed
        && Math.hypot(hero.position.x - GROTTO.center.x - GATES.x, hero.position.z - GROTTO.center.z - GATES.z) < 70) {
        gatesSeen = true;
        captions.show('Hades: There. Cerberus, chained to their machine, his fire feeding it. Its hide is iron up front, brother. Get behind it and break the plating on its back.', 8);
      }
      // The meadow's edge during the prologue (the wider world opens after the rocket, M6).
      if (hero && shell.screen === 'playing' && !world.flags.prologueDone
        && Math.hypot(hero.position.x, hero.position.z) > MEADOW_RADIUS - 3) {
        captions.show('The rest of the world can wait. For now.');
      }
      // Show the region the local god is in (the meadow, or the Underworld's grotto).
      const region = regionOf(hero);
      meadow.setRegion(region);
      meadow.setBarricadeBroken(!!world.flags.barricadeBroken);
      const floorAt = (x: number, z: number) => groundAt(region, x, z);

      // Cinematics drive the camera, HUD and effects from their sim timelines:
      // the rocket (SPEC §3.2), then straight on, Hades's arrival and the descent (§3.3).
      const rocketT = rocketTicks(world);
      const descentT = descentTicks({ world });
      const freedT = freedTicks(world);
      const wardenT = wardenTicks(world);
      const cutsceneId = rocketT !== null ? 'rocket' : descentT !== null ? 'descent' : freedT !== null ? FREED_ID : wardenT !== null ? WARDEN_ID : null;
      // The Gates: the pylon's beam follows the Mk. II; the hound plays the freeing scene.
      const mechEntity = findMech(world);
      const mechPoint = mechEntity ? interpolator.position(world, mechEntity.id, alpha, { x: 0, y: 0, z: 0 }) : undefined;
      meadow.setGates({
        mech: mechEntity && mechPoint && mechEntity.mech.mode !== 'down' ? { ...mechPoint, yaw: interpolator.rotation(world, mechEntity.id, alpha) ?? mechEntity.rotationY } : null,
        freedT: freedT === null ? null : (freedT + (frozen ? 0 : alpha)) / 30,
        freed: !!world.flags.cerberusFreed,
      });
      const cinematic = cutsceneId !== null && cameraMode === 'follow' && !!hero;
      const reduceMotion = settings.get().reduceMotion;
      let olympusTiming: { rocketFlight: number | null; sinceImpact: number | null; columns: number | null } = { rocketFlight: null, sinceImpact: null, columns: null };
      let fade = 0;
      let portalUp = 0;
      let portalDown = 0;
      if (cinematic && hero) {
        interpolator.position(world, hero.id, alpha, heroPoint);
        if (!cinematicStart || cinematicId !== cutsceneId) {
          const target = new THREE.Vector3();
          meadow.camera.getWorldDirection(target).multiplyScalar(10).add(meadow.camera.position);
          cinematicStart = { position: meadow.camera.position.clone(), target, fov: meadow.camera.fov };
          cinematicId = cutsceneId;
          // The scene hands back to a close camera (play resumes close and zooms out on the first move).
          cameraRig.rearm();
        }
        cameraRig.update(followCamera, heroPoint, 0, null, floorAt);
        const followPose: CameraPose = { position: followCamera.position.clone(), target: new THREE.Vector3(heroPoint.x, heroPoint.y + 1.55, heroPoint.z), fov: 50 };
        const ticksIn = (rocketT ?? descentT ?? freedT ?? wardenT ?? 0) + (frozen ? 0 : alpha);
        let pose: CameraPose;
        if (cutsceneId === 'rocket') {
          const frame = rocketFrame(ticksIn / 30, heroPoint, meadow.olympus, cinematicStart, followPose, reduceMotion);
          pose = frame.pose;
          meadow.setCinematicBoost(frame.bloom, frame.exposure);
          cameraShake = frame.shake;
          olympusTiming = frame;
        } else if (cutsceneId === WARDEN_ID) {
          const warden = findWarden(world);
          const wardenPoint = warden ? interpolator.position(world, warden.id, alpha, { x: 0, y: 0, z: 0 }) : undefined;
          pose = wardenFrame(ticksIn / 30, world.cutscene?.points ?? {}, wardenPoint, cinematicStart, followPose);
          meadow.setCinematicBoost(0, 0);
          cameraShake = 0;
        } else if (cutsceneId === FREED_ID) {
          const poseidon = findPoseidon(world);
          const poseidonPoint = poseidon ? interpolator.position(world, poseidon.id, alpha, { x: 0, y: 0, z: 0 }) : undefined;
          pose = freedFrame(ticksIn / 30, world.cutscene?.points ?? freedPoints(), CERBERUS_HOUND.yaw, poseidonPoint, cinematicStart, followPose);
          meadow.setCinematicBoost(0, 0);
          cameraShake = 0;
        } else {
          const hades = Object.values(world.entities).find((e) => e.npc && e.defId === 'hades');
          const hadesPoint = hades ? interpolator.position(world, hades.id, alpha, { x: 0, y: 0, z: 0 }) : undefined;
          const frame = descentFrame(ticksIn / 30, heroPoint, hadesPoint, world.cutscene?.points ?? {}, cinematicStart, followPose);
          pose = frame.pose;
          fade = frame.fade;
          portalUp = frame.portalUp;
          portalDown = frame.portalDown;
          meadow.setCinematicBoost(0, 0);
          cameraShake = 0;
        }
        meadow.camera.position.copy(pose.position);
        meadow.camera.fov = pose.fov;
        meadow.camera.updateProjectionMatrix();
        meadow.camera.lookAt(pose.target);
      } else {
        if (cinematicStart) {
          cinematicStart = null;
          cinematicId = null;
          meadow.camera.fov = 50;
          meadow.camera.updateProjectionMatrix();
          meadow.setCinematicBoost(0, 0);
          cameraRig.reset();
        }
        cameraShake = 0;
      }
      // Resting at the bed or falling in battle fades the screen too.
      fade = Math.max(fade, restPose(hero?.hero).fade);
      fadeOverlay.style.opacity = String(fade);
      fadeOverlay.hidden = fade <= 0.001;
      const points = world.cutscene?.points;
      portalA.update(points?.portalUp, hero?.position, portalUp, viewSeconds);
      portalB.update(points?.portalDown, hero?.position, portalDown, viewSeconds);
      meadow.setOlympus({
        shattered: world.flags.olympusShattered,
        ...olympusTiming,
        // Smoke rises from the broken summit through the first in-game day (SPEC §3.3).
        smoke: world.flags.olympusShattered && world.olympusShatteredAtMs !== null && world.nowMs - world.olympusShatteredAtMs < DAY_MS,
        reduceMotion,
      });

      if (cameraMode === 'follow' && hero && !cinematic) {
        // Keyboard camera (, and .) and auto-follow, so the game plays without a mouse.
        const turn = (input?.isHeld('cameraRight') ? 1 : 0) - (input?.isHeld('cameraLeft') ? 1 : 0);
        if (turn !== 0) {
          cameraRig.turn(turn * CAMERA_TURN_SPEED * dt);
          lastCameraInputAt = performance.now();
        } else if (settings.get().cameraAutoFollow && hero.hero?.moving && !hero.hero.lockTarget
          && performance.now() - lastCameraInputAt > AUTO_FOLLOW_DELAY_MS) {
          cameraRig.follow(hero.rotationY, dt);
        }
        interpolator.position(world, hero.id, alpha, heroPoint);
        const lock = hero.hero?.lockTarget ? world.entities[hero.hero.lockTarget] : undefined;
        // Start close; zoom out all the way once the god moves (team request). The grotto and its tunnel are enclosed: stay closer there.
        if (hero.hero?.moving) cameraRig.heroMoved();
        const gx = heroPoint.x - GROTTO.center.x;
        const gz = heroPoint.z - GROTTO.center.z;
        const enclosed = region === 'underworld' && (Math.hypot(gx, gz) < GROTTO.radius + 2 || (Math.abs(gx) < TUNNEL.halfWidth + 3 && gz > TUNNEL.toZ - 4 && gz < TUNNEL.fromZ + 2));
        cameraRig.update(meadow.camera, heroPoint, dt, lock ? lockPoint.set(lock.position.x, lock.position.y, lock.position.z) : null, floorAt, enclosed ? 6.5 : undefined);
        if (region === 'underworld' && Math.hypot(heroPoint.x - GROTTO.center.x, heroPoint.z - GROTTO.center.z) < GROTTO.radius + 1) {
          // Keep the camera inside the grotto's walls (pull it in toward the god).
          const c = GROTTO.center;
          const dx = meadow.camera.position.x - c.x;
          const dz = meadow.camera.position.z - c.z;
          const r = Math.hypot(dx, dz);
          const limit = GROTTO.radius + 1;
          if (r > limit) {
            meadow.camera.position.x = c.x + (dx * limit) / r;
            meadow.camera.position.z = c.z + (dz * limit) / r;
          }
          meadow.camera.position.y = Math.min(meadow.camera.position.y, c.y + 12);
          meadow.camera.lookAt(heroPoint.x, heroPoint.y + 1.55, heroPoint.z);
        }
      }
      // The HUD fades out for the cinematic and comes back after.
      const showHud = shell.screen === 'playing' && !world.cutscene;
      hud.setVisible(showHud);
      hud.update(world, hero?.id ?? null);
      minimap.update(world, hero?.id ?? null, showHud);
      tutorialPanel.update(world, showHud);
      for (const screen of screens) screen.refresh();
      labels.update(world, meadow.camera, activeSession.localPlayerId, dt, settings.get().reduceMotion, showHud);

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
        // Tell the sim whether this browser has seen the rocket before (then it's skippable).
        activeSession.sendIntent({ type: 'player:declare', seenRocket: progress.seenRocket, seenCutscenes: progress.seenCutscenes ?? [] });
        requestLock();
        view.canvas.focus();
      },
    });
    resolveReady();
  });
}
