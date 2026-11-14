import { rng } from '../rng';
import { HERO_ROCK_TOP, MEADOW_ORIGIN_HEIGHT, meadowHeightAt } from './meadow';

/**
 * Rock placement for the meadow, shared by physics (colliders) and the view
 * (meshes). It replays the first draws of the style test's layout RNG
 * (state 1337), so the rocks sit exactly where the approved reference has them.
 */
export const MEADOW_LAYOUT_SEED_STATE = 1337;

export interface RockPlacement {
  /** Index into the style test's rock list (geometry seed is index + 5). */
  index: number;
  position: { x: number; y: number; z: number };
  /** Scale on x, y, z of a unit dodecahedron. */
  scale: { x: number; y: number; z: number };
  rotationY: number;
}

function placeRocks(): { rocks: RockPlacement[]; stateAfter: number } {
  const layout = rng(0, 'meadow', MEADOW_LAYOUT_SEED_STATE);
  const rocks: RockPlacement[] = [];
  for (let i = 0; i < 14; i += 1) {
    const a = layout.next() * Math.PI * 2;
    const r = 6 + layout.next() * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.4 + layout.next() * 1.6;
    const rotationY = layout.next() * 6;
    rocks.push({ index: i, position: { x, y: meadowHeightAt(x, z) + s * 0.25, z }, scale: { x: s * 1.3, y: s, z: s * 1.1 }, rotationY });
  }
  return { rocks, stateAfter: layout.state };
}

const placed = placeRocks();

/** Radius of a boulder's collision ball (a squashed ball: close enough for bumping into). */
export function rockColliderRadius(rock: RockPlacement): number {
  return Math.min(rock.scale.x, rock.scale.z) * 0.9;
}

/** The 14 scattered boulders. */
export const MEADOW_ROCKS: readonly RockPlacement[] = placed.rocks;
/** RNG state after the rocks, where the view continues with trees, grass and so on. */
export const MEADOW_LAYOUT_STATE_AFTER_ROCKS = placed.stateAfter;

/** The hero rock under Zeus: centre and scale of its flat-topped dodecahedron. */
export const HERO_ROCK = {
  center: { x: 0, y: MEADOW_ORIGIN_HEIGHT + 0.7, z: 0 },
  scale: { x: 3.2, y: 2.5, z: 2.9 },
  top: HERO_ROCK_TOP,
} as const;

/**
 * Points of a convex hull approximating the hero rock: its flat top, its
 * widest ring and a narrow base buried in the ground.
 */
export function heroRockHullPoints(): Float32Array {
  const { center, scale, top } = HERO_ROCK;
  const rings: Array<[number, number]> = [
    // [y offset from centre in unit-sphere space, horizontal radius in unit-sphere space]
    [0.72, Math.sqrt(1 - 0.72 * 0.72)],
    [0, 1],
    [-0.9, Math.sqrt(1 - 0.81)],
  ];
  const points: number[] = [];
  const segments = 12;
  for (const [yUnit, radius] of rings) {
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const y = yUnit === 0.72 ? top : center.y + yUnit * scale.y;
      points.push(center.x + Math.cos(a) * radius * scale.x * 0.95, y, center.z + Math.sin(a) * radius * scale.z * 0.95);
    }
  }
  return new Float32Array(points);
}

/**
 * Ground height including the hero rock's flat top. Used where there's no
 * physics (unit tests) and for placing wildlife.
 */
export function groundHeightAt(x: number, z: number): number {
  const ground = meadowHeightAt(x, z);
  const { scale, top } = HERO_ROCK;
  const topRadius = Math.sqrt(1 - 0.72 * 0.72);
  const nx = x / (scale.x * topRadius);
  const nz = z / (scale.z * topRadius);
  return nx * nx + nz * nz <= 1 ? Math.max(ground, top) : ground;
}
