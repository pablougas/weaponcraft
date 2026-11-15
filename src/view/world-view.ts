import * as THREE from 'three';
import type { EffectSettings, QualityParams } from '../engine/settings';
import { rng } from '../sim/rng';
import { MEADOW_LAYOUT_STATE_AFTER_ROCKS } from '../sim/terrain/meadow-rocks';
import { smoothstep } from '../sim/terrain/noise';
import { CAMERA_PRESETS, type CameraPresetId } from './cameras';
import { createLook, type Look } from './look';
import { buildBirds } from './meadow/birds';
import { buildFlowers, buildGrass } from './meadow/foliage';
import { buildOlympus, type OlympusState, type OlympusView } from './meadow/olympus';
import { buildRocks, buildTrees } from './meadow/props';
import { buildTerrainMesh, buildWater } from './meadow/terrain-mesh';
import { createMeadowParticles } from './particles';
import { createPostStack } from './post';
import { createSky } from './sky';
import { lerp, lightingSegment } from './time-of-day';

/**
 * The meadow at the foot of Olympus, ported from docs/reference/style-test.html.
 * View-only: it reads the time of day and settings and draws; it holds no game state.
 */
export interface WorldView {
  readonly scene: THREE.Scene;
  readonly look: Look;
  readonly olympus: OlympusView;
  /** Olympus intact or shattered, and the rocket cinematic's distant effects. */
  setOlympus(state: Omit<OlympusState, 'time'>): void;
  /** Extra bloom and exposure for the impact's slow swell (0 = none). */
  setCinematicBoost(bloom: number, exposure: number): void;
  readonly camera: THREE.PerspectiveCamera;
  /** Advance animation to `timeSeconds` and light the scene for `dayFraction`. */
  update(timeSeconds: number, dayFraction: number): void;
  render(): void;
  resize(width: number, height: number): void;
  snapCam(id: CameraPresetId): void;
  setEffects(effects: EffectSettings): void;
  setReduceMotion(reduce: boolean): void;
  setQuality(params: QualityParams): void;
}

export function createWorldView(renderer: THREE.WebGLRenderer): WorldView {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 7000);
  const look = createLook(renderer.getPixelRatio());
  const { U } = look;

  // Same generator and starting state as the style test, so placements match.
  // The sim already placed the rocks (the first draws); continue from there.
  const layout = rng(0, 'meadow', MEADOW_LAYOUT_STATE_AFTER_ROCKS);
  const rand = () => layout.next();

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 500 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  scene.add(hemi);
  const fog = new THREE.FogExp2(0xffffff, 0.001);
  scene.fog = fog;

  const sky = createSky(U);
  scene.add(sky);
  scene.add(buildTerrainMesh(look));
  const water = buildWater();
  scene.add(water);
  const olympus = buildOlympus(look);
  scene.add(olympus.group);
  let olympusState: OlympusState = { shattered: false, sinceImpact: null, rocketFlight: null, columns: null, smoke: false, time: 0, reduceMotion: false };
  let bloomBoost = 0;
  let exposureBoost = 0;
  // Build order matters: each builder draws from the shared layout RNG.
  scene.add(buildRocks(look));
  scene.add(buildTrees(look, rand));
  const grass = buildGrass(look, rand);
  scene.add(grass);
  const flowers = buildFlowers(look, rand);
  scene.add(flowers.group);
  const particles = createMeadowParticles(U, rand);
  scene.add(...particles.all);
  const birds = buildBirds(rand);
  scene.add(birds.group);

  const post = createPostStack(renderer, scene, camera);
  let raysBase = 0.9;
  let raysEnabled = true;
  let particlesEnabled = true;

  const tmpA = new THREE.Color();
  const tmpB = new THREE.Color();
  const sunDirA = new THREE.Vector3();
  const sunDirB = new THREE.Vector3();
  const lerpColor = (a: string, b: string, f: number, out: THREE.Color) => out.copy(tmpA.set(a)).lerp(tmpB.set(b), f);
  const skyU = sky.material.uniforms;
  const gradeU = post.grade.uniforms;
  const waterDay = new THREE.Color('#2f6690');
  const waterNight = new THREE.Color('#0b1d3a');

  const applyLighting = (dayFraction: number) => {
    const { a, b, f } = lightingSegment(dayFraction);
    const sd = sunDirA.set(...a.sun).lerp(sunDirB.set(...b.sun), f).normalize();
    U.sunDir.value.copy(sd);
    sun.position.copy(sd).multiplyScalar(220);
    sun.target.position.set(0, 0, 0);
    lerpColor(a.sunCol, b.sunCol, f, sun.color);
    sun.intensity = lerp(a.sunI, b.sunI, f);
    U.sunColor.value.copy(sun.color).multiplyScalar(sun.intensity * 0.42);
    lerpColor(a.hemiS, b.hemiS, f, hemi.color);
    lerpColor(a.hemiG, b.hemiG, f, hemi.groundColor);
    hemi.intensity = lerp(a.hemiI, b.hemiI, f);
    lerpColor(a.amb, b.amb, f, U.ambColor.value);
    lerpColor(a.fog, b.fog, f, fog.color);
    U.fogColor.value.copy(fog.color);
    fog.density = lerp(a.fogD, b.fogD, f);
    U.fogDensity.value = fog.density;
    lerpColor(a.zen, b.zen, f, skyU.zenith.value);
    lerpColor(a.hor, b.hor, f, skyU.horizon.value);
    lerpColor(a.skySun, b.skySun, f, skyU.skySun.value);
    lerpColor(a.cLit, b.cLit, f, skyU.cloudLit.value);
    lerpColor(a.cDark, b.cDark, f, skyU.cloudDark.value);
    lerpColor(a.gnd, b.gnd, f, skyU.groundCol.value);
    skyU.discGain.value = lerp(a.disc, b.disc, f);
    post.bloom.strength = lerp(a.bloomS, b.bloomS, f);
    post.bloom.threshold = lerp(a.bloomT, b.bloomT, f);
    raysBase = lerp(a.rays, b.rays, f);
    lerpColor(a.rim, b.rim, f, U.rimColor.value);
    U.rimStrength.value = lerp(a.rimS, b.rimS, f);
    lerpColor(a.outline, b.outline, f, U.outlineColor.value);
    gradeU.shadowTint.value.set(lerp(a.sh[0], b.sh[0], f), lerp(a.sh[1], b.sh[1], f), lerp(a.sh[2], b.sh[2], f));
    gradeU.highTint.value.set(lerp(a.hi[0], b.hi[0], f), lerp(a.hi[1], b.hi[1], f), lerp(a.hi[2], b.hi[2], f));
    renderer.toneMappingExposure = lerp(a.exp, b.exp, f);
    const night = lerp(a.night, b.night, f);
    U.night.value = night;
    for (const glow of look.glowMaterials) glow.mat.emissiveIntensity = lerp(glow.day, glow.night, night);
    particles.fireflies.material.uniforms.opacity.value = lerp(a.fireflies, b.fireflies, f);
    particles.motes.material.uniforms.opacity.value = lerp(a.motes, b.motes, f);
    particles.petals.material.uniforms.opacity.value = 0.9 - night * 0.3;
    for (const points of particles.all) {
      points.visible = particlesEnabled && points.material.uniforms.opacity.value > 0.005;
    }
    birds.material.opacity = lerp(a.birds, b.birds, f);
    birds.group.visible = birds.material.opacity > 0.01;
    water.material.color.copy(waterDay).lerp(waterNight, night);
  };

  const sunScreen = new THREE.Vector3();
  const cameraDir = new THREE.Vector3();
  const updateGodRays = () => {
    sunScreen.copy(U.sunDir.value).multiplyScalar(4000).add(camera.position).project(camera);
    camera.getWorldDirection(cameraDir);
    const facing = cameraDir.dot(U.sunDir.value);
    const onScreen = smoothstep(-0.1, 0.35, facing) * smoothstep(1.6, 1.0, Math.max(Math.abs(sunScreen.x), Math.abs(sunScreen.y)));
    post.rays.uniforms.sunPos.value.set(sunScreen.x * 0.5 + 0.5, sunScreen.y * 0.5 + 0.5);
    const strength = raysBase * onScreen;
    post.rays.uniforms.strength.value = strength;
    post.rays.enabled = raysEnabled && strength > 0.001;
  };

  const target = new THREE.Vector3();
  const view: WorldView = {
    scene,
    look,
    olympus,
    setOlympus(state) {
      olympusState = { ...state, time: olympusState.time };
    },
    setCinematicBoost(bloom, exposure) {
      bloomBoost = bloom;
      exposureBoost = exposure;
    },
    camera,
    update(timeSeconds, dayFraction) {
      U.time.value = timeSeconds;
      applyLighting(dayFraction);
      post.bloom.strength += bloomBoost;
      renderer.toneMappingExposure += exposureBoost;
      olympusState.time = timeSeconds;
      olympus.update(olympusState);
      birds.update(timeSeconds);
      sky.position.copy(camera.position);
      updateGodRays();
    },
    render() {
      post.composer.render();
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      post.setSize(width, height);
    },
    snapCam(id) {
      const preset = CAMERA_PRESETS[id];
      camera.position.set(...preset.position);
      camera.lookAt(target.set(...preset.target));
      camera.updateMatrixWorld();
    },
    setEffects(effects) {
      post.bloom.enabled = effects.bloom;
      raysEnabled = effects.godRays;
      look.setOutlinesVisible(effects.outlines);
      post.grade.enabled = effects.colorGrade;
      particlesEnabled = effects.particles;
      for (const points of particles.all) {
        points.visible = particlesEnabled && points.material.uniforms.opacity.value > 0.005;
      }
    },
    setReduceMotion(reduce) {
      U.motion.value = reduce ? 0.35 : 1;
    },
    setQuality(params) {
      const ratio = Math.min(window.devicePixelRatio || 1, params.pixelRatioCap);
      renderer.setPixelRatio(ratio);
      post.setPixelRatio(ratio);
      U.pixelRatio.value = ratio;
      if (sun.shadow.mapSize.x !== params.shadowMapSize) {
        sun.shadow.mapSize.set(params.shadowMapSize, params.shadowMapSize);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
      grass.count = Math.floor((grass.userData.maxCount as number) * params.foliageDensity);
      flowers.flowers.count = Math.floor((flowers.flowers.userData.maxCount as number) * params.foliageDensity);
      post.setRaySamples(params.raySamples);
    },
  };
  view.snapCam('vista');
  return view;
}
