import * as THREE from 'three';
import { ROCKET_BEATS } from '../../sim/cutscenes/rocket';
import { TICK_HZ } from '../../sim/constants';
import type { Vec3 } from '../../sim/types';
import type { OlympusView } from '../meadow/olympus';

const s = (beat: keyof typeof ROCKET_BEATS) => ROCKET_BEATS[beat] / TICK_HZ;
const LAUNCH = s('launch');
const IMPACT = s('impact');
const PAN = s('pan');
const RETURN = s('return');
const END = s('end');

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface RocketFrame {
  pose: CameraPose;
  /** Size of the camera shake offset this frame, metres (0 with Reduce motion). */
  shake: number;
  /** Extra bloom and exposure for the impact's single slow swell. */
  bloom: number;
  exposure: number;
  /** Seconds since launch / impact / the pan, or null outside those beats (for Olympus). */
  rocketFlight: number | null;
  sinceImpact: number | null;
  columns: number | null;
}

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * The rocket cinematic's camera and effects as a pure function of time
 * (seconds since the cutscene started), so every frame is reproducible.
 * `start` is the camera pose when it began; `follow` is where the game camera
 * wants to be now (the cinematic eases back into it at the end).
 */
export function rocketFrame(
  t: number,
  hero: Vec3,
  olympus: OlympusView,
  start: CameraPose,
  follow: CameraPose,
  reduceMotion: boolean,
): RocketFrame {
  const summit = olympus.summitWorld(new THREE.Vector3());
  const base = olympus.baseWorld(new THREE.Vector3());
  // The wide shot: a few metres behind and above the god, looking up at the summit.
  const toSummit = new THREE.Vector3(summit.x - hero.x, 0, summit.z - hero.z).normalize();
  const widePos = new THREE.Vector3(hero.x, hero.y + 3.2, hero.z).addScaledVector(toSummit, -7);
  const wide: CameraPose = { position: widePos, target: summit.clone(), fov: 26 };
  const pan: CameraPose = { position: widePos.clone().add(new THREE.Vector3(0, 2, 0)), target: base.clone(), fov: 34 };

  const pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
  const blend = (a: CameraPose, b: CameraPose, f: number) => {
    pose.position.lerpVectors(a.position, b.position, f);
    pose.target.lerpVectors(a.target, b.target, f);
    pose.fov = a.fov + (b.fov - a.fov) * f;
  };
  if (t < 2) blend(start, wide, ease(t / 2));
  else if (t < PAN) blend(wide, { ...wide, fov: 28 }, ease((t - IMPACT) / (PAN - IMPACT)));
  else if (t < RETURN) blend({ ...wide, fov: 28 }, pan, ease((t - PAN) / (RETURN - 0.5 - PAN)));
  else blend(pan, follow, ease((t - RETURN) / (END - RETURN)));

  // Impact: a decaying shake (none with Reduce motion) and one slow bloom swell, never a flash.
  let shake = 0;
  if (!reduceMotion && t >= IMPACT && t < IMPACT + 3) {
    const amplitude = 0.35 * Math.exp(-(t - IMPACT) * 1.6);
    const offset = new THREE.Vector3(Math.sin(t * 31) * amplitude, Math.sin(t * 27 + 1) * amplitude * 0.6, 0);
    pose.position.add(offset);
    shake = offset.length();
  }
  const swell = t < IMPACT ? 0 : t < IMPACT + 0.8 ? ease((t - IMPACT) / 0.8) : Math.exp(-(t - IMPACT - 0.8) / 1.1);
  const strength = reduceMotion ? 0.4 : 1;
  return {
    pose,
    shake,
    bloom: 1.4 * swell * strength,
    exposure: 0.3 * swell * strength,
    rocketFlight: t >= LAUNCH ? t - LAUNCH : null,
    sinceImpact: t >= IMPACT ? t - IMPACT : null,
    columns: t >= PAN ? t - PAN : null,
  };
}

/** Captions for every beat (all text and important sound cues, CLAUDE.md). */
export const ROCKET_CAPTIONS: Readonly<Record<string, string>> = {
  launch: '[A rocket screams across the sky]',
  impact: '[A thunderous impact on the summit]',
  collapse: '[The top of Olympus breaks apart]',
  pan: '[War drums. Columns of soldiers climb the slopes from every side.]',
  return: 'Find the others. Survive.',
};
