import * as THREE from 'three';
import { TICK_HZ } from '../../sim/constants';
import { FREED_BEATS } from '../../sim/cutscenes/freed';
import type { Vec3 } from '../../sim/types';
import type { CameraPose } from './rocket';

const s = (beat: keyof typeof FREED_BEATS) => FREED_BEATS[beat] / TICK_HZ;
const CONDUITS = s('conduits');
const RISE = s('rise');
const BOND = s('bond');
const END = s('end');

/** Captions for the scene's beats (every line and important sound is captioned). */
export const FREED_CAPTIONS: Readonly<Record<string, string>> = {
  conduits: '[The conduits crack and burst]',
  chains: '[The chains snap]',
  rise: 'Hades: Rise, old friend. You are free.',
  howl: '[Cerberus howls: three voices as one]',
  bond: '[His fire flows into Zeus and Hades]',
};

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * "Cerberus Freed" camera as a pure function of time (seconds since the scene
 * started), so any frame can be screenshotted: a wide shot of the Mk. II
 * powering down, a low shot of the hound as the conduits burst and the chains
 * snap, a slow push-in as he rises and howls, then back to the god.
 * Calm moves only (no shake); the glow comes from the hound, never a flash.
 */
export function freedFrame(t: number, mech: Vec3, hound: Vec3, houndYaw: number, start: CameraPose, follow: CameraPose): CameraPose {
  const pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
  const blend = (a: CameraPose, b: CameraPose, f: number) => {
    pose.position.lerpVectors(a.position, b.position, f);
    pose.target.lerpVectors(a.target, b.target, f);
    pose.fov = a.fov + (b.fov - a.fov) * f;
  };
  // Shots, in world space around the Gates. The hound's heads face `ahead`.
  const toHound = new THREE.Vector3(hound.x - mech.x, 0, hound.z - mech.z).normalize();
  const side = new THREE.Vector3(-toHound.z, 0, toHound.x);
  const ahead = new THREE.Vector3(Math.sin(houndYaw), 0, Math.cos(houndYaw));
  const across = new THREE.Vector3(-ahead.z, 0, ahead.x);
  const at = new THREE.Vector3(hound.x, hound.y, hound.z);
  const wide: CameraPose = {
    position: new THREE.Vector3(mech.x, mech.y, mech.z).addScaledVector(side, 42).addScaledVector(toHound, -16).setY(mech.y + 16),
    target: new THREE.Vector3(mech.x, mech.y + 10, mech.z),
    fov: 52,
  };
  // In front of his three heads, off to the side away from his chain post, looking back at him.
  const houndLow: CameraPose = {
    position: at.clone().addScaledVector(ahead, 19).addScaledVector(across, -7).setY(hound.y + 3),
    target: at.clone().addScaledVector(ahead, 1.5).setY(hound.y + 2.5),
    fov: 50,
  };
  const houndClose: CameraPose = {
    position: at.clone().addScaledVector(ahead, 15).addScaledVector(across, -2).setY(hound.y + 6.5),
    target: at.clone().addScaledVector(ahead, 1.5).setY(hound.y + 3.4),
    fov: 46,
  };
  if (t < CONDUITS) blend(start, wide, ease(t / 1.6));
  else if (t < RISE) blend(wide, houndLow, ease((t - CONDUITS) / 1.6));
  else if (t < BOND) blend(houndLow, houndClose, ease((t - RISE) / (BOND - RISE)));
  else blend(houndClose, follow, ease((t - BOND) / (END - BOND - 0.5)));
  return pose;
}
