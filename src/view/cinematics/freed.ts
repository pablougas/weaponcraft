import * as THREE from 'three';
import { TICK_HZ } from '../../sim/constants';
import { FREED_BEATS } from '../../sim/cutscenes/freed';
import type { Vec3 } from '../../sim/types';
import type { CameraPose } from './rocket';

const s = (beat: keyof typeof FREED_BEATS) => FREED_BEATS[beat] / TICK_HZ;

/** Captions for the scene's beats (every line and important sound is captioned). */
export const FREED_CAPTIONS: Readonly<Record<string, string>> = {
  conduits: '[The conduits crack and burst]',
  chains: '[The chains snap]',
  rise: '[Cerberus rises, his fire returning]',
  howl: '[Cerberus howls: three voices as one]',
  lineHades: 'Hades: There you are, old friend. I am sorry it took me so long.',
  nuzzle: '[Cerberus lowers his three heads to his master]',
  bond: '[His fire flows into Zeus and Hades]',
  poseidon: '[Water surges up from the ground]',
  linePoseidon1: 'Poseidon: Brothers! I have been trying to reach you since Olympus fell, but that machine held the Gates. Its conduits sealed the river roads. I could not get through until it was beaten.',
  lineZeus: 'Zeus: Poseidon! Then the others may still be out there.',
  linePoseidon2: 'Poseidon: Some are. And the humans have built more of those machines. Come, brothers. There is much to tell.',
};

/** How long each caption stays up (long lines stay longer). */
export const FREED_CAPTION_SECONDS: Readonly<Record<string, number>> = { lineHades: 6, linePoseidon1: 14, lineZeus: 3.2, linePoseidon2: 9.5 };

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const v = (p: Vec3, dy = 0) => new THREE.Vector3(p.x, p.y + dy, p.z);

/**
 * "Cerberus Freed" camera as a pure function of time (seconds since the scene
 * started), so any frame can be screenshotted: the chains break and Cerberus
 * rises and howls; a two-shot as Hades walks up to him; wide for the bond; the
 * spout and Poseidon from the gods' side; over-the-shoulder for the brothers'
 * words; then back to the god. Calm moves only (no shake, never a flash).
 */
export function freedFrame(t: number, points: Record<string, Vec3>, houndYaw: number, poseidon: Vec3 | undefined, start: CameraPose, follow: CameraPose): CameraPose {
  const pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
  const blend = (a: CameraPose, b: CameraPose, f: number) => {
    pose.position.lerpVectors(a.position, b.position, f);
    pose.target.lerpVectors(a.target, b.target, f);
    pose.fov = a.fov + (b.fov - a.fov) * f;
  };
  const hound = points.hound;
  const ahead = new THREE.Vector3(Math.sin(houndYaw), 0, Math.cos(houndYaw));
  const across = new THREE.Vector3(-ahead.z, 0, ahead.x);
  const at = v(hound);
  // Low, in front of the chained hound (the chains break), then closer as he rises and howls.
  const houndLow: CameraPose = { position: at.clone().addScaledVector(ahead, 19).addScaledVector(across, -7).setY(hound.y + 3), target: at.clone().addScaledVector(ahead, 1.5).setY(hound.y + 2.5), fov: 50 };
  const houndClose: CameraPose = { position: at.clone().addScaledVector(ahead, 15).addScaledVector(across, -2).setY(hound.y + 6.5), target: at.clone().addScaledVector(ahead, 1.5).setY(hound.y + 3.4), fov: 46 };
  // The reunion: from the side, Hades and the hound's heads in one frame.
  const meet = v(points.reunion ?? hound);
  const reunion: CameraPose = { position: meet.clone().addScaledVector(across, 12).addScaledVector(ahead, 4).setY(meet.y + 3.6), target: meet.clone().addScaledVector(ahead, -2.5).setY(meet.y + 2.8), fov: 48 };
  const bond: CameraPose = { position: meet.clone().addScaledVector(across, 12).addScaledVector(ahead, 9).setY(meet.y + 6), target: at.clone().setY(hound.y + 3), fov: 50 };
  // Poseidon: the spout seen from behind the gods, then over Zeus's shoulder at Poseidon, and back at Zeus.
  const zeus = v(points.zeus ?? meet);
  const spring = v(points.spring ?? meet);
  const him = poseidon ? v(poseidon) : v(points.poseidon ?? spring);
  const toSpring = spring.clone().sub(zeus).setY(0).normalize();
  const side = new THREE.Vector3(-toSpring.z, 0, toSpring.x);
  const spout: CameraPose = { position: zeus.clone().addScaledVector(toSpring, -6).addScaledVector(side, 3).setY(zeus.y + 3.4), target: spring.clone().setY(spring.y + 3.5), fov: 50 };
  const toHim = him.clone().sub(zeus).setY(0).normalize();
  const sideHim = new THREE.Vector3(-toHim.z, 0, toHim.x);
  const onPoseidon: CameraPose = { position: zeus.clone().addScaledVector(toHim, -2.2).addScaledVector(sideHim, 1).setY(zeus.y + 2.3), target: him.clone().setY(him.y + 1.9), fov: 42 };
  const onZeus: CameraPose = { position: him.clone().addScaledVector(toHim, 2.2).addScaledVector(sideHim, -1).setY(him.y + 2.3), target: zeus.clone().setY(zeus.y + 1.9), fov: 42 };

  if (t < s('rise')) blend(start, houndLow, ease(t / 1.5));
  else if (t < s('reunion')) blend(houndLow, houndClose, ease((t - s('rise')) / 2));
  else if (t < s('bond')) blend(houndClose, reunion, ease((t - s('reunion')) / 1.8));
  else if (t < s('poseidon')) blend(reunion, bond, ease((t - s('bond')) / 2));
  else if (t < s('linePoseidon1')) blend(bond, spout, ease((t - s('poseidon')) / 1.5));
  else if (t < s('lineZeus')) blend(spout, onPoseidon, ease((t - s('linePoseidon1')) / 1.2));
  else if (t < s('linePoseidon2')) blend(onPoseidon, onZeus, ease((t - s('lineZeus')) / 0.9));
  else if (t < s('end') - 1.5) blend(onZeus, onPoseidon, ease((t - s('linePoseidon2')) / 0.9));
  else blend(onPoseidon, follow, ease((t - (s('end') - 1.5)) / 1.5));
  return pose;
}
