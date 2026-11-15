import { MEADOW_RADIUS } from './constants';
import { WATER_LEVEL } from './terrain/meadow';
import { groundHeightAt } from './terrain/meadow-rocks';
import { underworldClamp, underworldInside, underworldLocalHeight } from './terrain/underworld';
import type { Entity, Vec3 } from './types';

/**
 * The world's regions. The surface (the meadow under Olympus) and the
 * Underworld (SPEC §3.5) share one coordinate space: the Underworld sits far
 * below the surface, so physics, saves and networking need nothing special.
 * Each region has its own ground, edge and lighting (the view switches with
 * the local god).
 */
export type RegionId = 'surface' | 'underworld';

/** The Outer Grotto (M5.1): the first safe Underworld chamber and the new Refuge. */
export const GROTTO = {
  center: { x: 0, y: -2000, z: 0 },
  /** Walkable floor radius (the rock walls stand just outside). */
  radius: 20,
  /** The tunnel deeper into the Underworld opens to the north (−z); humans have barricaded it. */
  tunnelBearing: Math.PI,
} as const;

export function regionOf(entity: Entity | undefined): RegionId {
  return entity?.region ?? 'surface';
}

/** Are two entities in the same region? (Nothing reaches across: targeting, hits, labels.) */
export function sameRegion(a: Entity | undefined, b: Entity | undefined): boolean {
  return regionOf(a) === regionOf(b);
}

/** Ground height at (x, z) in a region. */
export function groundAt(region: RegionId, x: number, z: number): number {
  if (region === 'underworld') return GROTTO.center.y + underworldLocalHeight(x - GROTTO.center.x, z - GROTTO.center.z);
  return groundHeightAt(x, z);
}

/**
 * Keeps a point inside the region: the meadow's circle, or the Underworld's
 * grotto, tunnel and fields. Returns the nearest standable point and whether
 * the original was inside (`margin` metres in from the edge).
 */
export function regionClamp(region: RegionId, x: number, z: number, margin = 0): { x: number; z: number; inside: boolean } {
  if (region === 'underworld') {
    const c = GROTTO.center;
    const inside = underworldInside(x - c.x, z - c.z, margin);
    const p = underworldClamp(x - c.x, z - c.z, margin);
    return { x: p.x + c.x, z: p.z + c.z, inside };
  }
  const r = Math.hypot(x, z);
  const limit = MEADOW_RADIUS - margin;
  if (r <= limit) return { x, z, inside: true };
  return { x: (x / r) * limit, z: (z / r) * limit, inside: false };
}

/** The region's walkable area: centre and radius (a soft wall pushes back beyond it). */
export function regionBounds(region: RegionId): { x: number; z: number; radius: number } {
  if (region === 'underworld') return { x: GROTTO.center.x, z: GROTTO.center.z, radius: GROTTO.radius };
  return { x: 0, z: 0, radius: MEADOW_RADIUS };
}

/** Falling below this means the god went through the world: put them back on safe ground. */
export function fallOutHeight(region: RegionId): number {
  return region === 'underworld' ? GROTTO.center.y - 6 : WATER_LEVEL - 6;
}

/** True for a spot where lastSafe may be recorded (above water on the surface). */
export function isSafeFooting(region: RegionId, position: Vec3): boolean {
  return region === 'underworld' || position.y > WATER_LEVEL + 0.5;
}

/** A point in grotto-local coordinates (relative to its centre, on its floor). */
export function grottoPoint(x: number, z: number): Vec3 {
  return { x: GROTTO.center.x + x, y: GROTTO.center.y, z: GROTTO.center.z + z };
}
