import * as THREE from 'three';
import { GLADE_CENTER, MEADOW_ORIGIN_HEIGHT, meadowHeightAt, WATER_LEVEL } from '../../sim/terrain/meadow';
import { hash2 } from '../../sim/terrain/noise';
import type { Look } from '../look';

// Random draws below keep the style test's exact order so the placements
// match the approved reference. Don't reorder rand() calls.

type Rand = () => number;

function makeRockGeometry(seed: number, flatTop = false): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(1, 1);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = hash2(Math.round(x * 100) + seed * 13.1, Math.round(y * 100) + Math.round(z * 100) * 0.37);
    const s = 0.82 + n * 0.32;
    let ny = y * s;
    if (flatTop) ny = Math.min(ny, 0.72);
    p.setXYZ(i, x * s, ny, z * s);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** The hero rock Zeus stands on (top at HERO_ROCK_TOP) and 14 scattered boulders. */
export function buildRocks(look: Look, rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const rockMat = look.toon({ color: '#8a8f9c' });
  group.add(look.M(makeRockGeometry(1, true), rockMat, [0, MEADOW_ORIGIN_HEIGHT + 0.7, 0], { scale: [3.2, 2.5, 2.9], outline: 0.01 }));
  for (let i = 0; i < 14; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 6 + rand() * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = 0.4 + rand() * 1.6;
    group.add(look.M(makeRockGeometry(i + 5), rockMat, [x, meadowHeightAt(x, z) + s * 0.25, z], {
      scale: [s * 1.3, s, s * 1.1],
      rot: [0, rand() * 6, 0],
      outline: 0.03,
    }));
  }
  return group;
}

/** The blossom glade and 55 trees scattered across the meadow. */
export function buildTrees(look: Look, rand: Rand): THREE.Group {
  const group = new THREE.Group();
  const trunkMat = look.toon({ color: '#6a4a33' });
  const leafMats = [look.toon({ color: '#5f8f34' }), look.toon({ color: '#7aa63c' }), look.toon({ color: '#4c7a2e' })];
  const blossomMats = [look.toon({ color: '#f4a7c4' }), look.toon({ color: '#ffc6da' }), look.toon({ color: '#e98fb5' })];
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);

  const makeTree = (x: number, z: number, blossom: boolean, s: number): THREE.Group => {
    const tree = new THREE.Group();
    const y = meadowHeightAt(x, z) - 0.2;
    tree.position.set(x, y, z);
    tree.rotation.y = rand() * 6;
    const trunk = look.M(new THREE.CylinderGeometry(0.18 * s, 0.32 * s, 3.2 * s, 7), trunkMat, [0, 1.6 * s, 0], { outline: 0.03 });
    trunk.rotation.z = (rand() - 0.5) * 0.15;
    tree.add(trunk);
    const mats = blossom ? blossomMats : leafMats;
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rand();
      const rr = (0.6 + rand() * 0.7) * s;
      const leafY = (3.3 + rand() * 1.4) * s;
      const rot: [number, number, number] = [rand(), rand(), rand()];
      tree.add(look.M(leafGeo, mats[i % 3], [Math.cos(a) * rr, leafY, Math.sin(a) * rr], {
        scale: [1.5 * s, 1.15 * s, 1.5 * s],
        rot,
        outline: 0.035,
      }));
    }
    tree.add(look.M(leafGeo, mats[0], [0, 4.6 * s, 0], { scale: [1.6 * s, 1.3 * s, 1.6 * s], outline: 0.035 }));
    return tree;
  };

  const glade = [[0, 0], [-6, 3], [6, -4], [-3, -7], [8, 5], [-9, -3]];
  for (const [dx, dz] of glade) {
    const s = 0.9 + rand() * 0.5;
    group.add(makeTree(GLADE_CENTER.x + dx + (dx ? 0 : -7), GLADE_CENTER.z + dz - 6, true, s));
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
    group.add(makeTree(x, z, blossom, 0.9 + rand() * 0.9));
    placed += 1;
  }
  return group;
}
