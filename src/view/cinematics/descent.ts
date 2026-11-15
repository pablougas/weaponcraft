import * as THREE from 'three';
import { TICK_HZ } from '../../sim/constants';
import { DESCENT_BEATS, GROTTO_SPOTS } from '../../sim/cutscenes/descent';
import { grottoPoint } from '../../sim/regions';
import type { Vec3 } from '../../sim/types';
import type { CameraPose } from './rocket';

const s = (beat: keyof typeof DESCENT_BEATS) => DESCENT_BEATS[beat] / TICK_HZ;
const HADES = s('hades');
const PORTAL_DOWN = s('portalDown');
const FADE_OUT = s('fadeOut');
const ARRIVE = s('arrive');
const DISPATCH = s('dispatch');
const LINE_FREE = s('lineFree');
const END = s('end');

const ease = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const v = (p: Vec3, dy = 0) => new THREE.Vector3(p.x, p.y + dy, p.z);

export interface DescentFrame {
  pose: CameraPose;
  /** Black overlay 0–1: a calm fade through the portal (no flash). */
  fade: number;
  /** How open each portal is (0 = hidden). */
  portalUp: number;
  portalDown: number;
}

/**
 * The descent's camera, fade and portals as a pure function of time
 * (seconds since it started), like the rocket's, so frames are reproducible.
 */
export function descentFrame(t: number, zeus: Vec3, hades: Vec3 | undefined, points: Record<string, Vec3>, start: CameraPose, follow: CameraPose): DescentFrame {
  const pose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
  const blend = (a: CameraPose, b: CameraPose, f: number) => {
    pose.position.lerpVectors(a.position, b.position, f);
    pose.target.lerpVectors(a.target, b.target, f);
    pose.fov = a.fov + (b.fov - a.fov) * f;
  };

  if (t < ARRIVE) {
    // On the surface: over Zeus's shoulder toward the portal and Hades, then
    // over Hades's shoulder toward the way down behind Zeus.
    const other = hades ?? points.portalUp;
    const portal = points.portalUp ?? other;
    const along = v(portal).sub(v(zeus)).setY(0).normalize();
    const side = new THREE.Vector3(-along.z, 0, along.x);
    const top = Math.max(zeus.y, other.y);
    const overZeus: CameraPose = {
      position: v(zeus).addScaledVector(along, -3.6).addScaledVector(side, 2.6).setY(top + 2.6),
      target: v(zeus).lerp(v(other), 0.65).setY(top + 1.3),
      fov: 44,
    };
    const down = points.portalDown ?? zeus;
    const overHades: CameraPose = {
      position: v(other).addScaledVector(along, 3.6).addScaledVector(side, -2.6).setY(top + 2.5),
      target: v(zeus).lerp(v(down), 0.55).setY(top + 1.3),
      fov: 48,
    };
    if (t < PORTAL_DOWN - 0.5) blend(start, overZeus, ease(t / 2.5));
    else blend(overZeus, overHades, ease((t - (PORTAL_DOWN - 0.5)) / 2));
  } else {
    // In the grotto: from behind Zeus toward the rig, pan to the dispatch, follow the conduit into the tunnel, then hand back.
    const look: CameraPose = { position: v(grottoPoint(-2.4, 13.5), 2.6), target: v(grottoPoint(2.5, -8), 1.2), fov: 46 };
    const dispatch: CameraPose = { position: v(grottoPoint(-0.8, -3.2), 2.2), target: v(grottoPoint(GROTTO_SPOTS.dispatch.x + 0.6, GROTTO_SPOTS.dispatch.z - 0.6), 0.9), fov: 44 };
    const tunnel: CameraPose = { position: v(grottoPoint(1.2, -4), 2.2), target: v(grottoPoint(0, GROTTO_SPOTS.barricade.z - 2), 1.6), fov: 44 };
    if (t < DISPATCH - 1) blend(look, look, 0);
    else if (t < DISPATCH + 2.5) blend(look, dispatch, ease((t - (DISPATCH - 1)) / 3.5));
    else if (t < LINE_FREE) blend(dispatch, tunnel, ease((t - (DISPATCH + 2.5)) / (LINE_FREE - DISPATCH - 2.5)));
    else blend(tunnel, follow, ease((t - LINE_FREE) / (END - LINE_FREE)));
  }

  const fade = t < FADE_OUT ? 0 : t < ARRIVE ? ease((t - FADE_OUT) / (ARRIVE - FADE_OUT)) : 1 - ease((t - ARRIVE) / 1.6);
  const portalUp = t < HADES + 1.5 ? ease(t / 1.2) : 1 - ease((t - HADES - 1.5) / 1);
  const portalDown = t < PORTAL_DOWN ? 0 : t < ARRIVE ? ease((t - PORTAL_DOWN) / 1.5) : 0;
  return { pose, fade, portalUp, portalDown };
}

/** Every line and sound cue is captioned (CLAUDE.md). */
export const DESCENT_CAPTIONS: Readonly<Record<string, string>> = {
  hades: '[A shadow portal tears open. Hades steps out.]',
  lineHades1: 'Hades: Brother. Olympus has fallen, and the surface belongs to them now.',
  lineZeus: 'Zeus: They will answer for this.',
  lineHades2: 'Hades: Not today. We regroup below. The Underworld still answers to me.',
  portalDown: '[Hades opens the way down]',
  lineGrotto: 'Hades: The Outer Grotto. We are safe here. Or we should be.',
  dispatch: 'Dispatch, Gate Works: “The hound is chained. Its fire now feeds the Cerberus Mk. II. Keep the conduit running.”',
  lineFree: 'Hades: They chained Cerberus to their machine. We find him. We free him.',
};
