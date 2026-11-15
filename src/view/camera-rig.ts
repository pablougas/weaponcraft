import * as THREE from 'three';
import { meadowHeightAt } from '../sim/terrain/meadow';
import type { Vec3 } from '../sim/types';

const MIN_PITCH = -0.35;
const MAX_PITCH = 1.15;
const MIN_DISTANCE = 2.6;
/** All the way out: easier to see enemies coming (team request, Nov 15). */
export const MAX_DISTANCE = 16;
/** Where the camera starts (play starts, after a cutscene, waking at the bed): close on the god. */
export const START_DISTANCE = 5.2;
/** Zooming out also tilts down to at least this pitch, to look out over the area. */
const WIDE_PITCH = 0.42;
/** How quickly the distance eases toward its target (per second). */
const ZOOM_RATE = 2;
/** How quickly auto-follow swings the camera behind the god, per second. */
const FOLLOW_RATE = 1.3;
/** Keyboard camera turning speed, radians/s. */
export const CAMERA_TURN_SPEED = 2.2;
/** Camera looks at this height above the player's feet. */
const PIVOT_HEIGHT = 1.55;

/**
 * Third-person orbit camera around the local player. View state only: the
 * yaw is read by the input layer to turn WASD into world directions.
 * `forward` for yaw θ is (sin θ, 0, cos θ), matching entity headings.
 */
export class CameraRig {
  yaw = Math.PI + 0.22;
  pitch = 0.2;
  distance = START_DISTANCE;
  /** Where the distance is heading (the wheel, or the zoom-out once the god moves). */
  private targetDistance = START_DISTANCE;
  /** Waiting for the god's first move to zoom out all the way. */
  private armed = true;
  /** Easing the pitch down to the wide view (until the player looks around themselves). */
  private widening = false;
  private readonly pivot = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private initialized = false;

  /** Mouse movement in pixels; positive dx turns right, positive dy looks down. */
  look(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    const k = 0.0025 * sensitivity;
    if (dy !== 0) this.widening = false;
    this.yaw -= dx * k;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + dy * k * (invertY ? -1 : 1)));
  }

  /** Keyboard turning: positive `amount` (radians) turns right, like moving the mouse right. */
  turn(amount: number): void {
    this.yaw -= amount;
  }

  /**
   * Auto-follow (M3.1): eases the camera back behind `heading` so the arrow
   * keys steer. It doesn't swing around when the god walks toward the camera.
   */
  follow(heading: number, dt: number): void {
    const delta = Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw));
    if (Math.abs(delta) > 1.75) return;
    this.yaw += delta * Math.min(1, dt * FOLLOW_RATE);
  }

  /** Mouse wheel: the player's own zoom (the automatic zoom-out won't override it afterwards). */
  zoom(deltaY: number): void {
    this.targetDistance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, this.targetDistance * Math.exp(deltaY * 0.001)));
    this.armed = false;
    this.widening = false;
  }

  /** The god moved: the first time since the camera started close, ease out all the way. */
  heroMoved(): void {
    if (!this.armed) return;
    this.armed = false;
    this.targetDistance = MAX_DISTANCE;
    this.widening = true;
  }

  /** Start close again (after a cutscene or waking at the bed); the next move zooms out. */
  rearm(): void {
    this.targetDistance = START_DISTANCE;
    this.armed = true;
    this.widening = false;
  }

  /** Puts the camera behind a heading (e.g. the hero's, when play starts). */
  faceHeading(heading: number): void {
    this.yaw = heading;
  }

  /** Positions `camera` behind `target`; while locked on, swings to keep the lock target in view. */
  update(camera: THREE.PerspectiveCamera, target: Vec3, dt: number, lockTarget: Vec3 | null, floorAt: (x: number, z: number) => number = meadowHeightAt, maxDistance: number = MAX_DISTANCE): void {
    // Ease toward the wanted distance (never past a cap, e.g. in the grotto and its tunnel).
    const want = Math.min(this.targetDistance, maxDistance);
    this.distance = dt <= 0 || !this.initialized ? want : this.distance + (want - this.distance) * Math.min(1, dt * ZOOM_RATE);
    if (this.widening && dt > 0) {
      this.pitch += (Math.max(this.pitch, WIDE_PITCH) - this.pitch) * Math.min(1, dt * ZOOM_RATE);
      if (Math.abs(this.distance - want) < 0.05) this.widening = false;
    }
    if (lockTarget) {
      const desiredYaw = Math.atan2(lockTarget.x - target.x, lockTarget.z - target.z);
      const delta = Math.atan2(Math.sin(desiredYaw - this.yaw), Math.cos(desiredYaw - this.yaw));
      this.yaw += delta * Math.min(1, dt * 6);
    }
    this.pivot.set(target.x, target.y + PIVOT_HEIGHT, target.z);
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desired.set(
      this.pivot.x - Math.sin(this.yaw) * horizontal,
      this.pivot.y + Math.sin(this.pitch) * this.distance,
      this.pivot.z - Math.cos(this.yaw) * horizontal,
    );
    // Stay above the ground.
    const floor = floorAt(this.desired.x, this.desired.z) + 0.4;
    if (this.desired.y < floor) this.desired.y = floor;
    if (!this.initialized || dt <= 0) {
      camera.position.copy(this.desired);
      this.initialized = true;
    } else {
      camera.position.lerp(this.desired, Math.min(1, dt * 14));
    }
    camera.lookAt(this.pivot);
  }

  /** Next update snaps instead of easing (after a preset shot, a cutscene or a new game); starts close again. */
  reset(): void {
    this.initialized = false;
    this.rearm();
    this.distance = START_DISTANCE;
  }
}
