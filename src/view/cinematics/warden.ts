import * as THREE from 'three';
import { TICK_HZ } from '../../sim/constants';
import { WARDEN_BEATS } from '../../sim/cutscenes/warden';
import type { Vec3 } from '../../sim/types';
import type { CameraPose } from './rocket';

const s = (beat: keyof typeof WARDEN_BEATS) => WARDEN_BEATS[beat] / TICK_HZ;
const BREAKDOWN = s('breakdown');
const EMERGE = s('emerge');
const ROAR = s('roar');
const END = s('end');

/** Captions for the scene's beats (every line and important sound is captioned). */
export const WARDEN_CAPTIONS: Readonly<Record<string, string>> = {
  hatch: '[The rear hatch bursts open]',
  breakdown: '[The Mk. II groans and collapses]',
  emerge: '[Something huge climbs out of the hatch]',
  roar: 'The Warden: You broke my hound. Now I break you.',
};

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const v = (p: Vec3, dy = 0) => new THREE.Vector3(p.x, p.y + dy, p.z);

/**
 * "The Warden" camera as a pure function of time (seconds since the scene
 * started): wide on the Mk. II's back as the hatch bursts, a push-in as it
 * collapses, then low and close looking up at the Warden as he strides out
 * (to sell his size), and back to the god for the fight. No shake, no flash.
 */
export function wardenFrame(t: number, points: Record<string, Vec3>, warden: Vec3 | undefined, start: CameraPose, follow: CameraPose): CameraPose {
  const pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
  const blend = (a: CameraPose, b: CameraPose, f: number) => {
    pose.position.lerpVectors(a.position, b.position, f);
    pose.target.lerpVectors(a.target, b.target, f);
    pose.fov = a.fov + (b.fov - a.fov) * f;
  };
  const hatch = points.hatch ?? points.mech;
  const stand = points.stand ?? points.mech;
  const gods = points.gods ?? stand;
  const out = new THREE.Vector3(gods.x - stand.x, 0, gods.z - stand.z).normalize();
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const wide: CameraPose = { position: v(gods, 6).addScaledVector(side, 7), target: v(hatch, -1), fov: 52 };
  const closer: CameraPose = { position: v(stand, 4).addScaledVector(out, 9).addScaledVector(side, 4), target: v(hatch, -0.5), fov: 48 };
  const him = warden ?? stand;
  const low: CameraPose = {
    position: v(stand, 1.6).addScaledVector(out, 10).addScaledVector(side, 3),
    target: v(him, 3.1),
    fov: 46,
  };
  if (t < BREAKDOWN) blend(start, wide, ease(t / 1.5));
  else if (t < EMERGE) blend(wide, closer, ease((t - BREAKDOWN) / (EMERGE - BREAKDOWN)));
  else if (t < ROAR + 0.8) blend(closer, low, ease((t - EMERGE) / 1.6));
  else blend(low, follow, ease((t - ROAR - 0.8) / (END - ROAR - 0.8)));
  return pose;
}
