import { rng } from '../rng';
import { GLADE_CENTER, meadowHeightAt, WATER_LEVEL } from './meadow';
import { MEADOW_LAYOUT_STATE_AFTER_ROCKS } from './meadow-rocks';

/**
 * Tree placement for the meadow, so trunks can block movement. It replays the
 * style test's layout RNG exactly as the view's tree builder draws from it
 * (rotation, trunk tilt, leaf count, then 6 draws per leaf cluster), so every
 * trunk here sits under a tree on screen. A unit test checks the two match.
 */
export interface TreePlacement {
  x: number;
  z: number;
  /** Base of the trunk (slightly sunk into the ground, as drawn). */
  y: number;
  /** Size multiplier: trunk radius ≈ 0.32 × scale, height 3.2 × scale. */
  scale: number;
  blossom: boolean;
}

function placeTrees(): TreePlacement[] {
  const layout = rng(0, 'meadow', MEADOW_LAYOUT_STATE_AFTER_ROCKS);
  const rand = () => layout.next();
  const trees: TreePlacement[] = [];
  const makeTree = (x: number, z: number, blossom: boolean, scale: number) => {
    rand(); // heading
    rand(); // trunk tilt
    const leaves = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < leaves; i += 1) for (let d = 0; d < 6; d += 1) rand(); // angle, reach, height, 3 rotations
    trees.push({ x, z, y: meadowHeightAt(x, z) - 0.2, scale, blossom });
  };
  const glade = [[0, 0], [-6, 3], [6, -4], [-3, -7], [8, 5], [-9, -3]];
  for (const [dx, dz] of glade) {
    const s = 0.9 + rand() * 0.5;
    makeTree(GLADE_CENTER.x + dx + (dx ? 0 : -7), GLADE_CENTER.z + dz - 6, true, s);
  }
  let placed = 0;
  while (placed < 55) {
    const a = rand() * Math.PI * 2;
    const r = 22 + Math.pow(rand(), 0.8) * 260;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(x) < 9 && z < 0 && r < 70) continue;
    if (meadowHeightAt(x, z) < WATER_LEVEL + 1.5) continue;
    const blossom = rand() < 0.18;
    makeTree(x, z, blossom, 0.9 + rand() * 0.9);
    placed += 1;
  }
  return trees;
}

/** Every tree in the meadow: the blossom glade and 55 scattered trees. */
export const MEADOW_TREES: readonly TreePlacement[] = placeTrees();

/** Radius of a tree's trunk collider. */
export function trunkRadius(tree: TreePlacement): number {
  return 0.3 * tree.scale;
}
