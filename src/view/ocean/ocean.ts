import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OCEAN } from '../../sim/regions';
import { rng } from '../../sim/rng';
import { fbm } from '../../sim/terrain/noise';
import {
  avenueColumns,
  BACK_GATE_HALF_ANGLE,
  BEACH,
  BRIDGE,
  VILLAGE,
  VILLAGE_FOUNTAIN,
  VILLAGE_PLAZA,
  VILLAGE_RING_ROADS,
  VILLAGE_HOUSES,
  villageHouse,
  villageHouseHeights,
  CASTLE,
  CASTLE_GATE_HALF,
  CASTLE_TOWERS,
  CASTLE_WALL,
  castleWallSegments,
  CAUSEWAY,
  COLUMN_RADIUS,
  CRATES,
  gatePillars,
  GIANT_CLAMS,
  HARBOUR,
  KEEP,
  KEEP_BACK_OPENING_HALF,
  KEEP_DOOR,
  KEEP_PLINTH,
  keepSteps,
  KEEP_WALL,
  keepColumns,
  keepWallSegments,
  KRAKEN,
  KRAKEN_RIG,
  landDistance,
  OCEAN_GRID,
  oceanLocalHeight,
  OCEAN_ARRIVAL,
  PIER,
  SCAFFOLD_ANGLES,
  SEA_GATE,
  SHIPWRECK,
  STATUE,
  TEMPLES,
  TENTS,
  TOWER,
  wallSegmentLength,
} from '../../sim/terrain/ocean';
import { brainCoralGeometry, branchCoralGeometry, clamGeometry, conchGeometry, kelpGeometry, sandDollarGeometry, scallopGeometry, ShellBatch, starfishGeometry } from './shells';
import type { Look } from '../look';
import { CHAIN_SNAP_GAP, KRAKEN_FREED_BEATS, krakenFreedPoints } from '../../sim/cutscenes/kraken-freed';
import { TICK_HZ } from '../../sim/constants';

export interface OceanView {
  group: THREE.Group;
  setActive(active: boolean): void;
  /**
   * "The Kraken Freed" (Nov 16): seconds into the scene (null when it isn't
   * playing), and whether the kraken is already free (rig dark, chains gone).
   */
  setKraken(state: { t: number | null; freed: boolean }): void;
  /** The village bridge (Nov 17): seconds since it began to rise (null: still under the sea). */
  setVillage(state: { bridgeT: number | null }): void;
  update(time: number, reduceMotion: boolean): void;
}

/**
 * The Ocean (team request, Nov 15), all scenery: the sea, the beach and its
 * causeway, a human ship wrecked on the sand, Atlantis's island castle with
 * the humans' banners and scaffolds on its white walls, and Poseidon's kraken
 * chained in the water beside it while their rig drains him. The sea-gate
 * and the soldiers are sim entities, drawn by their own models.
 */
export function buildOcean(look: Look): OceanView {
  const { M, toon } = look;
  const group = new THREE.Group();
  group.position.set(OCEAN.center.x, OCEAN.center.y, OCEAN.center.z);
  const random = rng(0, 'ocean', 7177);
  const rand = () => random.next();

  // The sea: a wide plane at sea level, and a lighter shallows band around the land.
  const seaMat = new THREE.MeshPhongMaterial({ color: '#1f6788', specular: '#ffe3b0', shininess: 80 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.receiveShadow = true;
  group.add(sea);

  // Sand, the causeway and the island: one grid mesh shared with the physics heightfield.
  const g = OCEAN_GRID;
  const nx = Math.round((g.maxX - g.minX) / g.cell);
  const nz = Math.round((g.maxZ - g.minZ) / g.cell);
  const ground = new THREE.PlaneGeometry(nx * g.cell, nz * g.cell, nx, nz);
  ground.rotateX(-Math.PI / 2);
  ground.translate(g.minX + (nx * g.cell) / 2, 0, g.minZ + (nz * g.cell) / 2);
  const gp = ground.attributes.position;
  const colors = new Float32Array(gp.count * 3);
  const c = new THREE.Color();
  const sand = new THREE.Color('#e8d4a2');
  const sandB = new THREE.Color('#d6bc84');
  const shellGrit = new THREE.Color('#efc6b4');
  const wet = new THREE.Color('#a8956a');
  const paving = new THREE.Color('#f2e9d6');
  const pavingB = new THREE.Color('#e0d3bb');
  const tileAqua = new THREE.Color('#58c2b8');
  const tileDeep = new THREE.Color('#2a8f96');
  const tileCoral = new THREE.Color('#ee9f8c');
  const seabed = new THREE.Color('#2d6f74');
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const h = oceanLocalHeight(x, z);
    gp.setY(i, h);
    const d = landDistance(x, z);
    const fromCastle = Math.hypot(x - CASTLE.x, z - CASTLE.z);
    if (fromCastle < CASTLE_WALL.radius + 2) {
      // The courtyard: a mosaic of waves in ringed bands of aqua, deep teal and coral on pearl-white paving.
      const angle = Math.atan2(x - CASTLE.x, z - CASTLE.z);
      const wave = Math.sin(fromCastle * 0.45 + Math.sin(angle * 9) * 1.6);
      c.copy(paving).lerp(pavingB, fbm(x * 0.3, z * 0.3));
      if (wave > 0.8) c.lerp(tileAqua, 0.7);
      else if (wave < -0.94) c.lerp(tileDeep, 0.55);
      if (Math.abs(fromCastle - 30) < 1.2 || Math.abs(fromCastle - 46) < 1.2) c.copy(tileCoral);
      // The avenue from the gate to the keep stays plain pearl, and so does the way on to the back gate.
      if (Math.abs(x - CASTLE.x) < 4.5 && z > KEEP.z) c.copy(paving);
      if (Math.abs(x - CASTLE.x) < 6 && z < KEEP.z) c.copy(paving).lerp(pavingB, fbm(x * 0.4, z * 0.4) * 0.6);
      // The keep's hall: a great compass rose of aqua and gold on pearl.
      const inKeep = Math.hypot(x - KEEP.x, z - KEEP.z);
      if (inKeep < KEEP.radius) {
        const ka = Math.atan2(x - KEEP.x, z - KEEP.z);
        c.copy(paving);
        if (Math.abs(Math.sin(ka * 4)) * inKeep < 1.4 || Math.abs(inKeep - 9) < 0.6) c.copy(tileAqua);
        if (inKeep < 2.2) c.copy(tileDeep);
      }
    } else if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < VILLAGE.radius + 1 && d < -0.5) {
      // The village (Nov 17): warm coral-sand paving, a pale ring round the plaza and lanes to each door.
      const fromCentre = Math.hypot(x - VILLAGE.x, z - VILLAGE.z);
      c.set('#e6cfae').lerp(new THREE.Color('#d9b996'), fbm(x * 0.3, z * 0.3));
      // The four main streets and the two ring roads, paved pale; the plaza with a teal border.
      if (Math.abs(x - VILLAGE.x) < 3 || Math.abs(z - VILLAGE.z) < 3) c.set('#f1e3cb');
      for (const road of VILLAGE_RING_ROADS) if (Math.abs(fromCentre - road) < 1.4) c.set('#efdec2');
      if (fromCentre < VILLAGE_PLAZA) c.set('#f1e3cb').lerp(new THREE.Color('#e8d4b4'), fbm(x * 0.5, z * 0.5) * 0.6);
      if (Math.abs(fromCentre - VILLAGE_PLAZA) < 0.6) c.set('#5fb0a8');
    } else if (z < CASTLE.z - CASTLE_WALL.radius && d < -0.5 && (Math.hypot(x - HARBOUR.x, z - HARBOUR.z) < HARBOUR.radius + 1 || (Math.abs(x - HARBOUR.x) < PIER.halfWidth + 1 && z < PIER.fromZ + 4))) {
      // The humans' harbour: grey dock stone with a dark iron-banded rim.
      const fromDock = Math.hypot(x - HARBOUR.x, z - HARBOUR.z);
      c.set('#a9a69c').lerp(new THREE.Color('#8d8a82'), fbm(x * 0.35, z * 0.35));
      if (Math.abs(fromDock - (HARBOUR.radius - 2)) < 0.7) c.set('#5b5650');
    } else if (Math.abs(x) < CAUSEWAY.halfWidth - 1 && z < CAUSEWAY.fromZ - 2 && d < -1) {
      // The causeway: pale flagstones with an aqua border.
      c.copy(paving).lerp(pavingB, fbm(x * 0.5, z * 0.5));
      if (Math.abs(x) > CAUSEWAY.halfWidth - 2) c.copy(tileAqua);
    } else {
      c.copy(sand).lerp(sandB, fbm(x * 0.09 + 3, z * 0.09));
      // Crushed shell in the sand, pink-flecked.
      c.lerp(shellGrit, Math.max(0, fbm(x * 0.6 + 11, z * 0.6 - 5) - 0.55) * 1.6);
    }
    c.lerp(wet, THREE.MathUtils.smoothstep(d, -3, 0.5));
    if (h < -0.2) c.copy(seabed);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, toon({ vertexColors: true, grad: look.GRAD4, rim: false }));
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const marble = toon({ color: '#eef3ef' });
  const marbleShade = toon({ color: '#c3d4d3' });
  const teal = toon({ color: '#2f9a9a' });
  const nacre = toon({ color: '#bfe8e2', emissive: '#3a6f72', emissiveIntensity: 0.15 });
  const gold = toon({ color: '#d8b04a', emissive: '#5a3f08', emissiveIntensity: 0.2 });
  const wood = toon({ color: '#6a4a33' });
  const woodDark = toon({ color: '#4a3324' });
  const iron = toon({ color: '#3d3f4a' });
  const banner = toon({ color: '#9b2b2b', side: THREE.DoubleSide, rim: false });
  const canvas = toon({ color: '#e7dcc3', side: THREE.DoubleSide, rim: false });
  const conduitMat = toon({ color: '#6fd8d0', emissive: '#2fb8b0', emissiveIntensity: 0.9, rim: false });
  // The sea's colours: shells, pearls, starfish, coral and kelp.
  const shellPink = toon({ color: '#f3b9a6', side: THREE.DoubleSide });
  const shellCream = toon({ color: '#f6e6cc', side: THREE.DoubleSide });
  const shellPeach = toon({ color: '#f0a070', side: THREE.DoubleSide });
  const conchMat = toon({ color: '#f1cfb4' });
  const conchRose = toon({ color: '#e88f86' });
  const pearl = toon({ color: '#fbf6ee', emissive: '#c8dce0', emissiveIntensity: 0.35 });
  const starOrange = toon({ color: '#ec7a3c' });
  const starPurple = toon({ color: '#8a4fa8' });
  const starRed = toon({ color: '#d2493f' });
  const dollar = toon({ color: '#ece0c4' });
  const clamShell = toon({ color: '#9fc8d0', side: THREE.DoubleSide });
  const clamLip = toon({ color: '#3f7fb0', side: THREE.DoubleSide });
  const kelpMat = toon({ color: '#3f8a4a', side: THREE.DoubleSide, rim: false });
  const kelpGold = toon({ color: '#8a8a32', side: THREE.DoubleSide, rim: false });
  const coralMats = [toon({ color: '#e0705f' }), toon({ color: '#b84d7a' }), toon({ color: '#f0a64a' }), toon({ color: '#d867a8' })];
  const at = (x: number, z: number, lift = 0): [number, number, number] => [x, oceanLocalHeight(x, z) + lift, z];
  const shells = new ShellBatch();
  const scallop = scallopGeometry(1);
  const conch = conchGeometry(1, 2.4);
  const star = starfishGeometry(1);
  const sandDollar = sandDollarGeometry(1);
  const brain = brainCoralGeometry(1);
  const scallopMats = [shellPink, shellCream, shellPeach];
  const starMats = [starOrange, starPurple, starRed];
  /** A giant clam with a glowing pearl, `r` wide, facing `yaw`. */
  const giantClam = (x: number, z: number, r: number, yaw: number, y = oceanLocalHeight(x, z)) => {
    group.add(M(clamGeometry(r), clamShell, [x, y + r * 0.35, z], { rot: [0, yaw, 0], outline: 0.012 }));
    group.add(M(new THREE.TorusGeometry(r * 1.02, r * 0.05, 4, 32), clamLip, [x, y + r * 0.4, z], { rot: [Math.PI / 2, 0, 0], outline: false, cast: false }));
    group.add(M(new THREE.SphereGeometry(r * 0.28, 16, 12), pearl, [x, y + r * 0.55, z], { outline: 0.008 }));
  };

  // ---- Atlantis: the curtain wall, its towers, the gate, the keep, temples and the statue. ----
  const wallParts: THREE.BufferGeometry[] = [];
  const crenels: THREE.BufferGeometry[] = [];
  const baseY = oceanLocalHeight(CASTLE.x, CASTLE.z);
  const segLength = wallSegmentLength();
  const H = CASTLE_WALL.height;
  castleWallSegments().forEach((seg, i) => {
    const wall = new THREE.BoxGeometry(segLength, H, 2.2);
    wall.rotateY(seg.yaw);
    wall.translate(seg.x, baseY + H / 2 - 0.4, seg.z);
    wallParts.push(wall);
    for (const off of [-2.2, -0.7, 0.7, 2.2]) {
      const merlon = new THREE.BoxGeometry(0.9, 1.2, 2.3);
      merlon.translate(off, 0, 0);
      merlon.rotateY(seg.yaw);
      merlon.translate(seg.x, baseY + H + 0.2, seg.z);
      crenels.push(merlon);
    }
    const out = { x: Math.sin(seg.yaw), z: Math.cos(seg.yaw) };
    // A great scallop medallion on every other block's outer face, pink and cream by turns; starfish clinging lower down.
    if (i % 2 === 0) {
      shells.add(scallop, scallopMats[(i / 2) % 2], [seg.x + out.x * 1.18, baseY + H * 0.55, seg.z + out.z * 1.18], [0, seg.yaw, 0], 2.1, 0.014);
      shells.add(scallop, scallopMats[(i / 2) % 2], [seg.x - out.x * 1.18, baseY + H * 0.55, seg.z - out.z * 1.18], [0, seg.yaw + Math.PI, 0], 1.6, 0.012);
    } else if (rand() < 0.6) {
      const along = (rand() - 0.5) * segLength * 0.7;
      shells.add(star, starMats[i % 3], [seg.x + out.x * 1.12 + out.z * along, baseY + 1 + rand() * 3, seg.z + out.z * 1.12 - out.x * along], [0, seg.yaw, rand() * 6], 0.5 + rand() * 0.3, 0.008);
    }
    // Barnacle-like brain coral and coral branches at the wall's foot outside.
    if (rand() < 0.5) shells.add(brain, coralMats[i % 4], [seg.x + out.x * 2.2, baseY - 0.2, seg.z + out.z * 2.2], [0, rand() * 6, 0], 0.6 + rand() * 0.5, 0.008);
  });
  group.add(M(mergeGeometries(wallParts), marble, [0, 0, 0], { outline: 0.025 }));
  group.add(M(mergeGeometries(crenels), marbleShade, [0, 0, 0], { outline: 0.014 }));
  // Bands along the wall, both faces: gold at the top, a frieze of aqua waves lower down; both broken by the gate.
  const gap = Math.asin((CASTLE_GATE_HALF + 0.3) / CASTLE_WALL.radius);
  // …and by the back gate (Nov 16).
  const backGap = Math.asin((Math.abs(gatePillars()[2].x) - 1.4 + 0.3) / CASTLE_WALL.radius);
  /** An arc of band covering headings `start` to `start + length` round the castle. */
  const ringArc = (radius: number, tube: number, start: number, length: number) => {
    const ring = new THREE.TorusGeometry(radius, tube, 4, Math.ceil(150 * length / (Math.PI * 2)), length);
    ring.rotateX(Math.PI / 2);
    ring.rotateY(start + length - Math.PI / 2);
    return ring;
  };
  for (const side of [-1.15, 1.15]) {
    for (const [start, length] of [[gap, Math.PI - backGap - gap], [Math.PI + backGap, Math.PI - backGap - gap]] as const) {
      group.add(M(ringArc(CASTLE_WALL.radius + side, 0.18, start, length), gold, [CASTLE.x, baseY + H - 1.2, CASTLE.z], { outline: false, cast: false }));
      group.add(M(ringArc(CASTLE_WALL.radius + side, 0.45, start, length), teal, [CASTLE.x, baseY + 2.4, CASTLE.z], { outline: false, cast: false }));
    }
  }
  for (const tower of CASTLE_TOWERS) {
    const ty = oceanLocalHeight(tower.x, tower.z);
    const facing = Math.atan2(tower.x - CASTLE.x, tower.z - CASTLE.z);
    const R = TOWER.radius;
    group.add(M(new THREE.CylinderGeometry(R, R + 0.7, TOWER.height, 18), marble, [tower.x, ty + TOWER.height / 2 - 0.4, tower.z], { outline: 0.025 }));
    group.add(M(new THREE.CylinderGeometry(R + 0.9, R + 0.9, 0.8, 18), marbleShade, [tower.x, ty + TOWER.height, tower.z], { outline: 0.016 }));
    group.add(M(new THREE.TorusGeometry(R + 0.92, 0.14, 4, 36), gold, [tower.x, ty + TOWER.height + 0.42, tower.z], { rot: [Math.PI / 2, 0, 0], outline: false }));
    // Each tower is crowned with a great conch spire, a pearl at its tip.
    shells.add(conch, conchRose, [tower.x, ty + TOWER.height + 0.4, tower.z], [0, facing, 0], R * 0.95, 0.02);
    group.add(M(new THREE.SphereGeometry(0.7, 14, 10), pearl, [tower.x, ty + TOWER.height + 0.4 + R * 0.95 * 2.4 + 0.3, tower.z], { outline: 0.01 }));
    // A ring of little scallops round the tower's waist, and the humans' banner hung over the stone.
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      shells.add(scallop, k % 2 ? shellCream : shellPink, [tower.x + Math.sin(a) * (R + 0.35), ty + TOWER.height * 0.62, tower.z + Math.cos(a) * (R + 0.35)], [0, a, 0], 1.0, 0.01);
    }
    group.add(M(new THREE.PlaneGeometry(2.2, 6), banner, [tower.x + Math.sin(facing) * (R + 0.6), ty + TOWER.height * 0.38, tower.z + Math.cos(facing) * (R + 0.6)], { rot: [0, facing, 0], outline: false }));
  }
  // The gate: two great pillars crowned with conches, an arch, and a giant scallop crest over it.
  const gateZ = CASTLE.z + CASTLE_WALL.radius;
  const pillarX = CASTLE_GATE_HALF + 1.4;
  for (const pillar of gatePillars()) {
    group.add(M(new THREE.CylinderGeometry(1.6, pillar.radius, H + 6, 16), marble, at(pillar.x, pillar.z, (H + 6) / 2 - 0.4), { outline: 0.02 }));
    shells.add(conch, conchMat, at(pillar.x, pillar.z, H + 5.6), [0, Math.sign(pillar.x), 0], 1.6, 0.016);
  }
  // The back gate (Nov 16): a wide arch out to the harbour, hung with the humans' chains.
  const backZ = CASTLE.z - CASTLE_WALL.radius;
  const backX = Math.abs(gatePillars()[2].x);
  group.add(M(new THREE.TorusGeometry(backX, 0.9, 8, 36, Math.PI), marble, at(0, backZ, H + 2), { outline: 0.02 }));
  shells.add(scallop, shellCream, at(0, backZ - 0.8, H + 2 + backX * 0.55), [0, Math.PI, 0], 4.2, 0.022);
  void BACK_GATE_HALF_ANGLE;
  group.add(M(new THREE.TorusGeometry(pillarX, 0.9, 8, 36, Math.PI), marble, at(0, gateZ, H + 2), { outline: 0.02 }));
  shells.add(scallop, shellPink, at(0, gateZ + 0.8, H + 2 + pillarX * 0.6), [0, 0, 0], 5.2, 0.025);
  group.add(M(new THREE.SphereGeometry(0.9, 16, 12), pearl, at(0, gateZ + 1.5, H + 2 + pillarX * 0.6 + 1), { outline: 0.01 }));
  group.add(M(new THREE.PlaneGeometry(3.2, 7), banner, at(0, gateZ + 1.2, H - 2), { outline: false }));
  // The avenue: paired columns from the gate to the keep, each topped with a cream scallop.
  const avenue: THREE.BufferGeometry[] = [];
  for (const { x, z } of avenueColumns()) {
    const side = Math.sign(x);
    const col = new THREE.CylinderGeometry(0.55, 0.65, 8, 10);
    col.translate(x, oceanLocalHeight(x, z) + 3.8, z);
    avenue.push(col);
    shells.add(scallop, shellCream, at(x, z, 7.8), [0, -side * Math.PI / 2, 0], 1.1, 0.01);
  }
  group.add(M(mergeGeometries(avenue), marbleShade, [0, 0, 0], { outline: 0.012 }));
  // Poseidon's statue on his fountain: a shell basin, a robed figure, a gold trident.
  const sy = oceanLocalHeight(STATUE.x, STATUE.z);
  // The basin is one lathed shape (floor, inner wall, rim, sloped outer wall), and the water sits well below
  // the rim and well above the floor, so no two surfaces share a plane (they flickered when they did).
  const ri = STATUE.radius - 0.45;
  const basin = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.3),
    new THREE.Vector2(ri, 0.3),
    new THREE.Vector2(ri, 1.2),
    new THREE.Vector2(STATUE.radius, 1.2),
    new THREE.Vector2(STATUE.radius + 0.4, -0.1),
  ], 40);
  group.add(M(basin, toon({ color: '#c3d4d3', side: THREE.DoubleSide }), [STATUE.x, sy, STATUE.z], { outline: 0.016 }));
  const fountainWater = new THREE.CircleGeometry(ri + 0.02, 40);
  fountainWater.rotateX(-Math.PI / 2);
  group.add(M(fountainWater, toon({ color: '#5fc7d4', emissive: '#1d6f7c', emissiveIntensity: 0.3, rim: false }), [STATUE.x, sy + 0.85, STATUE.z], { outline: false, cast: false }));
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2;
    shells.add(scallop, scallopMats[k % 3], [STATUE.x + Math.sin(a) * (STATUE.radius + 0.42), sy + 0.6, STATUE.z + Math.cos(a) * (STATUE.radius + 0.42)], [0, a, 0], 0.9, 0.008);
  }
  group.add(M(new THREE.CylinderGeometry(1.4, 1.7, 3.6, 12), marble, [STATUE.x, sy + 2.2, STATUE.z], { outline: 0.014 }));
  group.add(M(new THREE.CylinderGeometry(0.9, 1.5, 5, 14), marble, [STATUE.x, sy + 6.5, STATUE.z], { outline: 0.016 }));
  group.add(M(new THREE.SphereGeometry(0.75, 14, 10), marble, [STATUE.x, sy + 9.6, STATUE.z], { outline: 0.012 }));
  group.add(M(new THREE.ConeGeometry(0.6, 1.3, 10), marbleShade, [STATUE.x, sy + 8.9, STATUE.z + 0.45], { rot: [Math.PI + 0.3, 0, 0], outline: 0.01 }));
  for (let k = 0; k < 5; k += 1) group.add(M(new THREE.ConeGeometry(0.12, 0.7, 5), conchRose, [STATUE.x + (k - 2) * 0.32, sy + 10.4 - Math.abs(k - 2) * 0.1, STATUE.z], { outline: 0.006 }));
  group.add(M(new THREE.CylinderGeometry(0.1, 0.1, 9, 6), gold, [STATUE.x + 1.6, sy + 7.5, STATUE.z + 0.3], { outline: 0.006 }));
  for (const x of [-0.45, 0, 0.45]) group.add(M(new THREE.ConeGeometry(0.13, 0.9, 5), gold, [STATUE.x + 1.6 + x, sy + 12.4 + (x === 0 ? 0.2 : 0), STATUE.z + 0.3], { outline: 0.006 }));
  group.add(M(new THREE.BoxGeometry(1.1, 0.14, 0.18), gold, [STATUE.x + 1.6, sy + 12, STATUE.z + 0.3], { outline: false }));
  // The keep: a great drum of columns under a nacre dome, a lantern, and a gold trident.
  const ky = oceanLocalHeight(KEEP.x, KEEP.z);
  const KR = KEEP.radius;
  // The keep's base (Nov 16): a solid round step that is also the hall's floor, with stairs front and back.
  const PT = KEEP_PLINTH.top;
  group.add(M(new THREE.CylinderGeometry(KEEP_PLINTH.radius, KEEP_PLINTH.radius + 0.2, PT + 1, 56), marbleShade, [KEEP.x, ky + PT - (PT + 1) / 2, KEEP.z], { outline: 0.018 }));
  for (const step of keepSteps()) {
    group.add(M(new THREE.BoxGeometry(step.halfX * 2, step.top + 1, step.halfZ * 2), marble, [step.x, ky + step.top - (step.top + 1) / 2, step.z], { outline: 0.012 }));
  }
  // The hall's floor: a compass rose of aqua and gold on pearl, laid on the base.
  {
    const floor = new THREE.CircleGeometry(KR - 0.3, 64, 8);
    floor.rotateX(-Math.PI / 2);
    const fp = floor.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < fp.count; i += 1) {
      const fx = fp.getX(i);
      const fz = fp.getZ(i);
      const r = Math.hypot(fx, fz);
      const fa = Math.atan2(fx, fz);
      col.copy(paving);
      if (Math.abs(Math.sin(fa * 4)) * r < 1.4 || Math.abs(r - 9) < 0.6) col.copy(tileAqua);
      if (r < 2.2) col.copy(tileDeep);
      fc.set([col.r, col.g, col.b], i * 3);
    }
    floor.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    group.add(M(floor, toon({ vertexColors: true, grad: look.GRAD4, rim: false }), [KEEP.x, ky + PT + 0.02, KEEP.z], { outline: false, cast: false }));
  }
  // The hall's wall (Nov 16): a ring of blocks with the door toward the gate and a great opening at the back.
  const keepBlocks: THREE.BufferGeometry[] = [];
  for (const seg of keepWallSegments()) {
    const block = new THREE.BoxGeometry(seg.length, KEEP_WALL.height, KEEP_WALL.thickness);
    block.rotateY(seg.yaw);
    block.translate(seg.x, ky + KEEP_WALL.height / 2 - 0.4, seg.z);
    keepBlocks.push(block);
  }
  // Lintels: the wall carries on above the door and above the back opening.
  const lintel = (yaw: number, halfWidth: number, bottom: number) => {
    const half = Math.asin(Math.min(1, (halfWidth + 1.2) / KR));
    const geo = new THREE.CylinderGeometry(KR + KEEP_WALL.thickness / 2, KR + KEEP_WALL.thickness / 2, KEEP_WALL.height - bottom, 24, 1, false, yaw - half, half * 2);
    geo.translate(KEEP.x, ky + bottom + (KEEP_WALL.height - bottom) / 2 - 0.4, KEEP.z);
    return geo;
  };
  keepBlocks.push(lintel(0, KEEP_DOOR.halfWidth, KEEP_PLINTH.top + KEEP_DOOR.height));
  keepBlocks.push(lintel(Math.PI, KEEP_BACK_OPENING_HALF, KEEP_PLINTH.top + 13));
  const keepWallMat = toon({ color: '#eef3ef', side: THREE.DoubleSide });
  group.add(M(mergeGeometries(keepBlocks), keepWallMat, [0, 0, 0], { outline: 0.02 }));
  const columns: THREE.BufferGeometry[] = [];
  for (const colAt of keepColumns()) {
    const col = new THREE.CylinderGeometry(COLUMN_RADIUS - 0.1, COLUMN_RADIUS, 20, 10);
    col.translate(colAt.x, ky + 10.6, colAt.z);
    columns.push(col);
  }
  for (let i = 0; i < 28; i += 2) {
    const a = (i / 28) * Math.PI * 2;
    // Scallops on the drum, but none over the door or the back opening (the door has its own).
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.5 || Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < 0.6) continue;
    shells.add(scallop, scallopMats[(i / 2) % 3], [KEEP.x + Math.sin(a) * (KR + 0.9), ky + 15, KEEP.z + Math.cos(a) * (KR + 0.9)], [0, a, 0], 1.8, 0.012);
  }
  group.add(M(mergeGeometries(columns), marbleShade, [0, 0, 0], { outline: 0.012 }));
  group.add(M(new THREE.CylinderGeometry(KR + 3, KR + 3, 1.2, 40), marble, [KEEP.x, ky + 21.2, KEEP.z], { outline: 0.02 }));
  group.add(M(new THREE.TorusGeometry(KR + 3.02, 0.2, 4, 64), gold, [KEEP.x, ky + 21.2, KEEP.z], { rot: [Math.PI / 2, 0, 0], outline: false }));
  // The dome, ribbed like a shell.
  const dome = new THREE.SphereGeometry(KR + 1.2, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  {
    const p = dome.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const rib = 1 + 0.035 * Math.abs(Math.cos(Math.atan2(z, x) * 8));
      p.setXYZ(i, x * rib, p.getY(i), z * rib);
    }
    dome.computeVertexNormals();
  }
  group.add(M(dome, nacre, [KEEP.x, ky + 21.8, KEEP.z], { outline: 0.03 }));
  group.add(M(new THREE.CylinderGeometry(3, 3.2, 4, 16), marble, [KEEP.x, ky + 21.8 + KR + 2.4, KEEP.z], { outline: 0.016 }));
  group.add(M(new THREE.SphereGeometry(3.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), teal, [KEEP.x, ky + 21.8 + KR + 4.3, KEEP.z], { outline: 0.016 }));
  const tipY = ky + 21.8 + KR + 7.6;
  group.add(M(new THREE.CylinderGeometry(0.18, 0.18, 6, 6), gold, [KEEP.x, tipY + 3, KEEP.z], { outline: false }));
  for (const x of [-0.9, 0, 0.9]) group.add(M(new THREE.ConeGeometry(0.24, 1.2, 5), gold, [KEEP.x + x, tipY + (x === 0 ? 6.6 : 6.2), KEEP.z], { outline: 0.008 }));
  group.add(M(new THREE.BoxGeometry(2.1, 0.22, 0.3), gold, [KEEP.x, tipY + 5.8, KEEP.z], { outline: false }));
  // The keep's door, toward the gate, under a scallop; the humans' banners either side.
  // (Nov 16) The door sits in the wall: a marble frame round the doorway; the leaves are the keep-door entity.
  const doorZ = KEEP.z + KR + KEEP_WALL.thickness / 2;
  const DW = KEEP_DOOR.halfWidth;
  const DH = KEEP_DOOR.height;
  const doorY = ky + KEEP_PLINTH.top;
  // The jambs and lintel run through the wall's whole thickness, so nothing shows round the door from the side.
  const frameDepth = KEEP_WALL.thickness + 0.5;
  for (const side of [-1, 1]) group.add(M(new THREE.BoxGeometry(0.9, DH + 0.9, frameDepth), marbleShade, [KEEP.x + side * (DW + 0.45), doorY + (DH + 0.9) / 2, KEEP.z + KR], { outline: 0.012 }));
  group.add(M(new THREE.BoxGeometry(DW * 2 + 1.8, 0.9, frameDepth + 0.2), marbleShade, [KEEP.x, doorY + DH + 0.45, KEEP.z + KR], { outline: 0.012 }));
  // The scallop over the door glows sea-blue (team request): a pulsing shell and a soft blue light on the threshold.
  const doorShellMat = toon({ color: '#9fe6ff', emissive: '#1f8fff', emissiveIntensity: 1.6, side: THREE.DoubleSide, rim: false });
  const doorShell = M(scallop, doorShellMat, [KEEP.x, doorY + DH + 2.1, doorZ + 0.5], { outline: 0.014 });
  doorShell.scale.setScalar(2.6);
  group.add(doorShell);
  const doorGlow = new THREE.PointLight('#3aa8ff', 30, 16, 2);
  doorGlow.position.set(KEEP.x, doorY + DH + 2.2, doorZ + 2.2);
  group.add(doorGlow);
  for (const side of [-1, 1]) group.add(M(new THREE.PlaneGeometry(2.2, 6.5), banner, [KEEP.x + side * 6.4, ky + 10, doorZ + 0.12], { outline: false }));
  // The temples: round, columned, under ribbed pink shell domes with a pearl on top.
  for (const t of TEMPLES) {
    const ty = oceanLocalHeight(t.x, t.z);
    group.add(M(new THREE.CylinderGeometry(t.radius + 1, t.radius + 1.3, 0.8, 24), marbleShade, [t.x, ty + 0.2, t.z], { outline: 0.014 }));
    group.add(M(new THREE.CylinderGeometry(t.radius - 1.2, t.radius - 1.2, 8, 20), marble, [t.x, ty + 4, t.z], { outline: 0.016 }));
    const ring: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      const col = new THREE.CylinderGeometry(0.35, 0.42, 8, 8);
      col.translate(t.x + Math.sin(a) * t.radius, ty + 4.4, t.z + Math.cos(a) * t.radius);
      ring.push(col);
    }
    group.add(M(mergeGeometries(ring), marbleShade, [0, 0, 0], { outline: 0.01 }));
    group.add(M(new THREE.CylinderGeometry(t.radius + 0.7, t.radius + 0.7, 0.7, 24), marble, [t.x, ty + 8.6, t.z], { outline: 0.014 }));
    const tdome = dome.clone().scale((t.radius + 0.5) / (KR + 1.2), 1.15 * (t.radius + 0.5) / (KR + 1.2), (t.radius + 0.5) / (KR + 1.2));
    group.add(M(tdome, shellPink, [t.x, ty + 8.9, t.z], { outline: 0.016 }));
    group.add(M(new THREE.SphereGeometry(0.6, 14, 10), pearl, [t.x, ty + 9 + (t.radius + 0.5) * 1.15, t.z], { outline: 0.008 }));
  }

  // Human occupation: tents and crates in the courtyard, scaffolds against the wall.
  for (const [x, z, yaw] of TENTS) {
    group.add(M(new THREE.ConeGeometry(2.4, 3, 4), canvas, at(x, z, 1.5), { rot: [0, yaw, 0], outline: 0.012 }));
  }
  for (const [x, z, s, yaw] of CRATES) {
    group.add(M(new THREE.BoxGeometry(s, s, s), wood, at(x, z, s / 2), { rot: [0, yaw, 0], outline: 0.01 }));
  }
  for (const sa of SCAFFOLD_ANGLES) {
    const scaffold = new THREE.Group();
    for (const dx of [-3, 3]) for (const dz of [-1, 1]) scaffold.add(M(new THREE.BoxGeometry(0.25, H, 0.25), wood, [dx, H / 2, dz], { outline: 0.006 }));
    for (const y of [H * 0.33, H * 0.66, H - 0.5]) scaffold.add(M(new THREE.BoxGeometry(6.6, 0.2, 2.3), wood, [0, y, 0], { outline: 0.008 }));
    scaffold.position.set(CASTLE.x + Math.sin(sa) * (CASTLE_WALL.radius - 2.8), baseY, CASTLE.z + Math.cos(sa) * (CASTLE_WALL.radius - 2.8));
    scaffold.rotation.y = sa;
    group.add(scaffold);
  }
  // Giant clams in the courtyard's corners, pearls glowing.
  for (const [x, z, r, yaw] of GIANT_CLAMS) giantClam(x, z, r, yaw);

  // ---- The rig: a tall iron frame and glowing conduit, cables out over the wall to the kraken. ----
  const RIG_H = H + 4;
  const rig = new THREE.Group();
  rig.position.set(...at(KRAKEN_RIG.x, KRAKEN_RIG.z));
  rig.add(M(new THREE.BoxGeometry(4.2, 0.5, 3.2), iron, [0, 0.25, 0], { outline: 0.012 }));
  for (const [x, z] of [[-1.8, -1.3], [1.8, -1.3], [-1.8, 1.3], [1.8, 1.3]]) rig.add(M(new THREE.BoxGeometry(0.3, RIG_H, 0.3), iron, [x, RIG_H / 2, z], { outline: 0.008 }));
  for (const y of [RIG_H * 0.35, RIG_H * 0.7]) rig.add(M(new THREE.BoxGeometry(4, 0.25, 3), iron, [0, y, 0], { outline: 0.008 }));
  rig.add(M(new THREE.CylinderGeometry(1, 1, 4, 14), conduitMat, [0, RIG_H - 3, 0], { outline: 0.012 }));
  rig.add(M(new THREE.BoxGeometry(4.4, 0.4, 3.4), iron, [0, RIG_H, 0], { outline: 0.01 }));
  group.add(rig);
  const cablePath = (from: THREE.Vector3, to: THREE.Vector3, sag: number) => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= sag;
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  };
  const rigTop = new THREE.Vector3(KRAKEN_RIG.x, oceanLocalHeight(KRAKEN_RIG.x, KRAKEN_RIG.z) + RIG_H, KRAKEN_RIG.z);
  // The drain cables: they tear loose with the chains when the kraken is freed.
  const drainCables: THREE.Mesh[] = [];
  for (const [dz, dy] of [[-4, 10], [4, 7]] as const) {
    const end = new THREE.Vector3(KRAKEN.x - 9 * KRAKEN.scale, 6 + dy * 0.6, KRAKEN.z + dz);
    const cable = M(new THREE.TubeGeometry(cablePath(rigTop, end, -6), 40, 0.24, 6), conduitMat, [0, 0, 0], { outline: false, cast: false });
    group.add(cable);
    drainCables.push(cable);
  }

  // ---- The harbour behind the castle (Nov 16): iron bollards round the dock, lamps on the pier. ----
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.4) continue; // the pier joins here
    const x = HARBOUR.x + Math.sin(a) * (HARBOUR.radius - 1.2);
    const z = HARBOUR.z + Math.cos(a) * (HARBOUR.radius - 1.2);
    group.add(M(new THREE.CylinderGeometry(0.4, 0.5, 1.1, 8), iron, at(x, z, 0.55), { outline: 0.008 }));
  }
  const lampMat = toon({ color: '#ffd98a', emissive: '#ffb340', emissiveIntensity: 1.2, rim: false });
  for (const z of [PIER.fromZ - 2, PIER.toZ + 2]) {
    for (const side of [-1, 1]) {
      const x = HARBOUR.x + side * (PIER.halfWidth - 1);
      group.add(M(new THREE.CylinderGeometry(0.12, 0.15, 4, 6), iron, at(x, z, 2), { outline: 0.006 }));
      group.add(M(new THREE.SphereGeometry(0.35, 10, 8), lampMat, at(x, z, 4.2), { outline: false }));
    }
  }

  // ---- The Atlantean village (Nov 17): coral-stone houses with shell roofs round a plaza and its fountain. ----
  const villageGroup = new THREE.Group();
  group.add(villageGroup);
  const coralStone = toon({ color: '#e9b99a' });
  const coralStoneDark = toon({ color: '#c98f74' });
  const roofMats = [toon({ color: '#5fb8b0' }), toon({ color: '#8fd0e0' }), toon({ color: '#e0a6c8' }), toon({ color: '#f2d27a' })];
  const lanternMat = toon({ color: '#c8fff4', emissive: '#3fe0c8', emissiveIntensity: 1.1, rim: false });
  // 34 houses (Nov 17): built as a handful of merged meshes (one per material) so the big village stays cheap.
  const wallGeos: THREE.BufferGeometry[] = [];
  const darkGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[][] = roofMats.map(() => []);
  const glowGeos: THREE.BufferGeometry[] = [];
  const placed = (geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0) => {
    if (yaw) geo.rotateY(yaw);
    geo.translate(x, y, z);
    return geo;
  };
  VILLAGE_HOUSES.forEach((h, i) => {
    const hv = villageHouse(h);
    const y = oceanLocalHeight(hv.x, hv.z);
    const wallH = villageHouseHeights(h).wall;
    // Round walls with a doorway cut toward the plaza (the door itself is an entity).
    const doorHalf = Math.asin(1.0 / h.radius);
    wallGeos.push(placed(new THREE.CylinderGeometry(h.radius, h.radius + 0.25, wallH, 28, 1, true, hv.doorYaw + doorHalf, Math.PI * 2 - doorHalf * 2), hv.x, y + wallH / 2 - 0.1, hv.z));
    // Above the doorway, a lintel; a band of darker coral at the base.
    darkGeos.push(placed(new THREE.BoxGeometry(2.6, 0.5, 0.6), hv.door.x, y + 2.75, hv.door.z, hv.doorYaw));
    wallGeos.push(placed(new THREE.BoxGeometry(2.6, Math.max(0.1, wallH - 2.75), 0.5), hv.door.x, y + 2.75 + (wallH - 2.75) / 2, hv.door.z, hv.doorYaw));
    darkGeos.push(placed(new THREE.CylinderGeometry(h.radius + 0.3, h.radius + 0.35, 0.5, 28, 1, true, hv.doorYaw + doorHalf, Math.PI * 2 - doorHalf * 2), hv.x, y + 0.2, hv.z));
    // A shell dome roof, ribbed like a scallop, and a little lantern at its tip.
    const roof = new THREE.SphereGeometry(h.radius + 0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    roof.scale(1, 0.75, 1);
    roofGeos[(i * 3 + Math.floor(h.ring / 10)) % roofMats.length].push(placed(roof, hv.x, y + wallH - 0.1, hv.z));
    for (let k = 0; k < 10; k += 1) {
      const rib = new THREE.TorusGeometry(h.radius + 0.62, 0.07, 4, 12, Math.PI / 2);
      rib.rotateY((k / 10) * Math.PI * 2);
      rib.scale(1, 0.75, 1);
      darkGeos.push(placed(rib, hv.x, y + wallH - 0.1, hv.z));
    }
    glowGeos.push(placed(new THREE.SphereGeometry(0.32, 8, 6), hv.x, y + wallH - 0.1 + (h.radius + 0.6) * 0.75 + 0.2, hv.z));
    // Round windows either side of the door.
    for (const side of [-1, 1]) {
      const a = hv.doorYaw + side * 0.7;
      const win = new THREE.CircleGeometry(0.42, 12);
      win.rotateY(a);
      glowGeos.push(placed(win, hv.x + Math.sin(a) * (h.radius + 0.27), y + 2.2, hv.z + Math.cos(a) * (h.radius + 0.27)));
    }
  });
  // Lanterns round the plaza and along the four main streets.
  const lampPost = (lx: number, lz: number) => {
    const ly = oceanLocalHeight(lx, lz);
    darkGeos.push(placed(new THREE.CylinderGeometry(0.09, 0.12, 2.6, 6), lx, ly + 1.3, lz));
    glowGeos.push(placed(new THREE.SphereGeometry(0.28, 8, 6), lx, ly + 2.7, lz));
  };
  for (let k = 0; k < 12; k += 1) {
    const a = (k / 12) * Math.PI * 2 + Math.PI / 12;
    lampPost(VILLAGE.x + Math.sin(a) * (VILLAGE_PLAZA + 1), VILLAGE.z + Math.cos(a) * (VILLAGE_PLAZA + 1));
  }
  for (let d = VILLAGE_PLAZA + 10; d < VILLAGE.radius - 6; d += 13) {
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (const side of [-1, 1]) lampPost(VILLAGE.x + sx * d + sz * side * 4, VILLAGE.z + sz * d + sx * side * 4);
    }
  }
  villageGroup.add(M(mergeGeometries(wallGeos), toon({ color: '#e9b99a', side: THREE.DoubleSide }), [0, 0, 0], { outline: 0.02 }));
  villageGroup.add(M(mergeGeometries(darkGeos), coralStoneDark, [0, 0, 0], { outline: false }));
  roofGeos.forEach((geos, i) => {
    if (geos.length) villageGroup.add(M(mergeGeometries(geos), roofMats[i], [0, 0, 0], { outline: 0.02 }));
  });
  villageGroup.add(M(mergeGeometries(glowGeos), lanternMat, [0, 0, 0], { outline: false, cast: false }));
  // The plaza's coral fountain.
  {
    const fy = oceanLocalHeight(VILLAGE_FOUNTAIN.x, VILLAGE_FOUNTAIN.z);
    villageGroup.add(M(new THREE.CylinderGeometry(VILLAGE_FOUNTAIN.radius, VILLAGE_FOUNTAIN.radius + 0.2, 0.9, 28), coralStoneDark, [VILLAGE_FOUNTAIN.x, fy + 0.45, VILLAGE_FOUNTAIN.z], { outline: 0.015 }));
    villageGroup.add(M(new THREE.CircleGeometry(VILLAGE_FOUNTAIN.radius - 0.25, 28), toon({ color: '#6fd0e8', emissive: '#1f7a9a', emissiveIntensity: 0.3, rim: false }), [VILLAGE_FOUNTAIN.x, fy + 0.8, VILLAGE_FOUNTAIN.z], { rot: [-Math.PI / 2, 0, 0], outline: false }));
    villageGroup.add(M(new THREE.CylinderGeometry(0.3, 0.5, 2.4, 10), coralStone, [VILLAGE_FOUNTAIN.x, fy + 1.6, VILLAGE_FOUNTAIN.z], { outline: 0.012 }));
    shells.add(conch, conchMat, [VILLAGE_FOUNTAIN.x, fy + 3.4, VILLAGE_FOUNTAIN.z], [0, 0.6, 0], 2.2, 0.014);
  }
  /** Within `pad` metres of the bridge's footprint (sea props stay clear of it). */
  function nearBridge(x: number, z: number, pad: number): boolean {
    return Math.abs(x - VILLAGE.x) < BRIDGE.halfWidth + pad && z < BRIDGE.fromZ + pad && z > BRIDGE.toZ - pad;
  }
  // ---- The bridge to the village (Nov 17): old coral-stone spans on pillars, under the sea until it rises. ----
  const bridgeGroup = new THREE.Group();
  group.add(bridgeGroup);
  {
    const length = BRIDGE.fromZ - BRIDGE.toZ;
    const midZ = (BRIDGE.fromZ + BRIDGE.toZ) / 2;
    // The deck is three side-by-side slabs (stone edges, a pale walkway down the
    // middle) so no two surfaces share a plane and flicker; its top sits a little
    // above the land at both ends for the same reason.
    const walk = BRIDGE.halfWidth * 0.55;
    const edge = BRIDGE.halfWidth - walk;
    bridgeGroup.add(M(new THREE.BoxGeometry(walk * 2, 0.9, length), toon({ color: '#f1e3cb', rim: false }), [VILLAGE.x, BRIDGE.deck - 0.45, midZ], { outline: 0.02 }));
    for (const side of [-1, 1]) {
      bridgeGroup.add(M(new THREE.BoxGeometry(edge, 0.9, length), coralStone, [VILLAGE.x + side * (walk + edge / 2), BRIDGE.deck - 0.45, midZ], { outline: 0.02 }));
      // Low parapets.
      bridgeGroup.add(M(new THREE.BoxGeometry(0.5, 0.8, length), coralStoneDark, [VILLAGE.x + side * (BRIDGE.halfWidth - 0.25), BRIDGE.deck + 0.4, midZ], { outline: 0.012 }));
    }
    // Supports down into the sea, under the deck.
    const spans = 6;
    for (let k = 0; k <= spans; k += 1) {
      const z = BRIDGE.fromZ - (k / spans) * length;
      for (const side of [-1, 1]) {
        bridgeGroup.add(M(new THREE.CylinderGeometry(0.75, 1, 7, 10), coralStoneDark, [VILLAGE.x + side * (BRIDGE.halfWidth - 0.9), BRIDGE.deck - 4.5, z], { outline: 0.012 }));
      }
    }
  }
  let bridgeState: { bridgeT: number | null } = { bridgeT: null };
  const BRIDGE_SUNK = -9;

  // ---- Poseidon's kraken, chained in the sea beside the castle. ----
  const kraken = new THREE.Group();
  kraken.position.set(KRAKEN.x, 0, KRAKEN.z);
  kraken.scale.setScalar(KRAKEN.scale);
  // His face turned toward the causeway, where the gods come from.
  kraken.rotation.y = Math.atan2(-KRAKEN.x, -20 - KRAKEN.z);
  const hide = toon({ color: '#7d2f5c' });
  const hideDark = toon({ color: '#4c1d3c' });
  const sucker = toon({ color: '#e8b2b8' });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffc04a', toneMapped: false });
  kraken.add(M(new THREE.SphereGeometry(6, 24, 16), hide, [0, 4.5, -2.5], { scale: [1, 1.35, 1.1], rot: [-0.35, 0, 0], outline: 0.03 }));
  kraken.add(M(new THREE.SphereGeometry(4.2, 20, 12), hideDark, [0, 1.6, 1.6], { scale: [1.2, 0.8, 1], outline: 0.025 }));
  for (const side of [-1, 1]) {
    // Big eyes on the front of his mantle, above the lower bulk, so they read from the shore.
    kraken.add(M(new THREE.SphereGeometry(1.1, 14, 10), toon({ color: '#f2e6c8' }), [side * 2.3, 5.6, 4.6], { outline: 0.012 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), eyeMat);
    eye.position.set(side * 2.35, 5.6, 5.45);
    eye.scale.set(1, 0.55, 0.6);
    kraken.add(eye);
    // A heavy brow: he is not happy.
    kraken.add(M(new THREE.BoxGeometry(2.4, 0.55, 0.9), hideDark, [side * 2.3, 6.8, 4.7], { rot: [0, 0, side * -0.3], outline: 0.012 }));
  }
  // Tentacles: thick tubes curling up out of the sea, some pinned by chains.
  const tentacles: Array<{ mesh: THREE.Object3D; phase: number }> = [];
  const chainLinks: THREE.BufferGeometry[][] = [];
  const anchors: THREE.Vector3[] = [];
  const tentacleCount = 8;
  for (let i = 0; i < tentacleCount; i += 1) {
    const a = (i / tentacleCount) * Math.PI * 2 + 0.2;
    const reach = 9 + (i % 3) * 2.5;
    const points = [
      new THREE.Vector3(Math.sin(a) * 3.5, 0.4, Math.cos(a) * 3.5),
      new THREE.Vector3(Math.sin(a) * reach * 0.55, 4 + (i % 2) * 2.5, Math.cos(a) * reach * 0.55),
      new THREE.Vector3(Math.sin(a + 0.35) * reach, 7 + (i % 3) * 1.5, Math.cos(a + 0.35) * reach),
      new THREE.Vector3(Math.sin(a + 0.8) * reach * 1.08, 4.5 + (i % 2) * 3, Math.cos(a + 0.8) * reach * 1.08),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 40, 1, 8);
    // Taper toward the tip.
    const tp = tube.attributes.position;
    const center = new THREE.Vector3();
    for (let v = 0; v < tp.count; v += 1) {
      const t = Math.floor(v / 9) / 40;
      curve.getPointAt(Math.min(1, t), center);
      const k = 1 - t * 0.82;
      tp.setXYZ(v, center.x + (tp.getX(v) - center.x) * k, center.y + (tp.getY(v) - center.y) * k, center.z + (tp.getZ(v) - center.z) * k);
    }
    tube.computeVertexNormals();
    const arm = new THREE.Group();
    arm.add(M(tube, i % 2 ? hide : hideDark, [0, 0, 0], { outline: 0.02 }));
    // Pale suckers along the underside.
    for (let k = 1; k < 6; k += 1) {
      const p = curve.getPointAt(k / 7);
      arm.add(M(new THREE.SphereGeometry(0.32 * (1 - k / 9), 8, 6), sucker, [p.x, p.y - 0.75 * (1 - k / 8), p.z], { outline: false, cast: false }));
    }
    kraken.add(arm);
    tentacles.push({ mesh: arm, phase: i * 0.9 });
    // Every other arm is shackled, its chain run down to an iron anchor post on the island or a buoy.
    if (i % 2 === 0) {
      const cuff = curve.getPointAt(0.62);
      arm.add(M(new THREE.TorusGeometry(0.85, 0.22, 6, 14), iron, [cuff.x, cuff.y, cuff.z], { rot: [Math.PI / 2, 0, a], outline: 0.01 }));
      anchors.push(cuff.clone());
    }
  }
  group.add(kraken);
  // Chains: link by link from each cuff (in world-local terms) to a post at the island's edge.
  kraken.updateMatrixWorld(true);
  // Posts on the island's rim, fanned round the side that faces him.
  const towardKraken = Math.atan2(KRAKEN.x - CASTLE.x, KRAKEN.z - CASTLE.z);
  const posts = [-0.12, 0.05, 0.22, -0.28].map((da) => ({
    x: CASTLE.x + Math.sin(towardKraken + da) * (CASTLE.radius - 4),
    z: CASTLE.z + Math.cos(towardKraken + da) * (CASTLE.radius - 4),
  }));
  anchors.forEach((local, i) => {
    chainLinks.push([]);
    const from = local.clone().applyMatrix4(kraken.matrix);
    const post = posts[i % posts.length];
    const py = oceanLocalHeight(post.x, post.z);
    group.add(M(new THREE.CylinderGeometry(0.45, 0.6, 3.2, 8), iron, [post.x, py + 1.4, post.z], { outline: 0.01 }));
    const to = new THREE.Vector3(post.x, py + 2.6, post.z);
    const curve = cablePath(from, to, 4);
    const length = curve.getLength();
    const links = Math.floor(length / 0.8);
    for (let k = 0; k <= links; k += 1) {
      const t = k / links;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const link = new THREE.TorusGeometry(0.42, 0.12, 5, 10);
      link.scale(1.4, 1, 1);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent.normalize());
      const twist = new THREE.Quaternion().setFromAxisAngle(tangent, k % 2 ? Math.PI / 2 : 0);
      link.applyQuaternion(q.premultiply(twist));
      link.translate(p.x, p.y, p.z);
      chainLinks[i].push(link);
    }
  });
  // One mesh per chain, so they can snap one at a time when the kraken is freed.
  const chains = chainLinks.filter((links) => links.length > 0).map((links) => {
    const mesh = M(mergeGeometries(links), iron, [0, 0, 0], { outline: false });
    group.add(mesh);
    return mesh;
  });

  // ---- The wrecked ship, run aground and listing on the beach. ----
  const ship = new THREE.Group();
  ship.position.set(SHIPWRECK.x, oceanLocalHeight(SHIPWRECK.x, SHIPWRECK.z) - 0.6, SHIPWRECK.z);
  ship.rotation.set(0, SHIPWRECK.yaw, 0.32);
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3, 3);
  hullShape.quadraticCurveTo(-3.2, 0, 0, -0.4);
  hullShape.quadraticCurveTo(3.2, 0, 3, 3);
  hullShape.lineTo(-3, 3);
  const hullGeo = new THREE.ExtrudeGeometry(hullShape, { depth: 17, bevelEnabled: false, steps: 1 });
  hullGeo.translate(0, 0, -9.5);
  ship.add(M(hullGeo, woodDark, [0, 0, 0], { outline: 0.025 }));
  // The bow's point and the broken stern's exposed ribs.
  ship.add(M(new THREE.ConeGeometry(3.05, 4.5, 4, 1, false, Math.PI / 4), woodDark, [0, 1.6, 9.2], { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.75], outline: 0.02 }));
  for (let k = 0; k < 5; k += 1) {
    const rib = new THREE.TorusGeometry(2.8, 0.16, 5, 14, Math.PI);
    ship.add(M(rib, wood, [0, 2.9, -10 - k * 1.1], { rot: [0, 0, Math.PI], outline: 0.008 }));
  }
  ship.add(M(new THREE.BoxGeometry(5.6, 0.25, 15), wood, [0, 2.7, 0], { outline: 0.015 }));
  // The mast, snapped: a stump, and the rest lying across the sand with its torn red-and-white sail.
  ship.add(M(new THREE.CylinderGeometry(0.32, 0.38, 3.5, 8), wood, [0, 4.4, 1], { outline: 0.01 }));
  group.add(ship);
  const fallenMast = new THREE.Group();
  fallenMast.position.set(...at(SHIPWRECK.x + 8, SHIPWRECK.z - 4, 0.3));
  fallenMast.rotation.y = 1.2;
  fallenMast.add(M(new THREE.CylinderGeometry(0.28, 0.32, 11, 8), wood, [0, 0, 0], { rot: [0, 0, Math.PI / 2 - 0.08], outline: 0.01 }));
  fallenMast.add(M(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), wood, [2.5, 0.25, 0], { rot: [Math.PI / 2, 0, 0], outline: 0.006 }));
  const sail = new THREE.PlaneGeometry(5.5, 4, 8, 6);
  const sp = sail.attributes.position;
  for (let v = 0; v < sp.count; v += 1) sp.setZ(v, Math.sin(sp.getX(v) * 0.9) * 0.4 + Math.cos(sp.getY(v) * 1.3) * 0.3);
  sail.computeVertexNormals();
  fallenMast.add(M(sail, canvas, [2.2, 0.6, 1.8], { rot: [-Math.PI / 2 + 0.2, 0, 0.1], outline: false }));
  fallenMast.add(M(new THREE.PlaneGeometry(5.5, 0.9), banner, [2.2, 0.75, 0.2], { rot: [-Math.PI / 2 + 0.2, 0, 0.1], outline: false }));
  group.add(fallenMast);
  // Spilled cargo: barrels and crates on the sand.
  for (let i = 0; i < 7; i += 1) {
    const x = SHIPWRECK.x + 3 + rand() * 9;
    const z = SHIPWRECK.z - 6 + rand() * 12;
    if (i % 2) group.add(M(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), wood, at(x, z, 0.45), { rot: [Math.PI / 2, rand() * 3, 0], outline: 0.008 }));
    else group.add(M(new THREE.BoxGeometry(0.9, 0.9, 0.9), wood, at(x, z, 0.4), { rot: [0, rand() * 3, 0.15], outline: 0.008 }));
  }

  // Atlantis's ruins along the beach: broken columns, and coral at the water's edge.
  for (const [x, z, h] of [[16, 20, 3.2], [20, 26, 1.6], [-8, 14, 2.4], [12, 12, 4]] as const) {
    group.add(M(new THREE.CylinderGeometry(0.5, 0.55, h, 10), marble, at(x, z, h / 2 - 0.2), { rot: [0, 0, (h % 1) * 0.3], outline: 0.012 }));
  }
  group.add(M(new THREE.CylinderGeometry(0.55, 0.5, 3, 10), marbleShade, at(18, 23, 0.4), { rot: [0, 0.6, Math.PI / 2], outline: 0.012 }));
  for (let i = 0; i < 26; i += 1) {
    const a = rand() * Math.PI * 2;
    const x = Math.sin(a) * (BEACH.rx - 1) + (rand() - 0.5) * 3;
    const z = BEACH.z + Math.cos(a) * (BEACH.rz - 1);
    if (Math.abs(x) < 6 && z < 16) continue;
    const s = 0.4 + rand() * 0.6;
    group.add(M(new THREE.ConeGeometry(0.25 * s, 1.4 * s, 5), coralMats[i % 3], at(x, z, 0.4 * s), { rot: [(rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6], outline: 0.006, cast: false }));
  }
  // Sea stacks out in the water, so the horizon isn't empty.
  for (const [x, z, r, h] of [[-120, -60, 7, 20], [-110, 40, 9, 26], [110, 20, 7, 20], [80, -230, 10, 30], [-100, -220, 8, 22], [160, -150, 11, 28]] as const) {
    group.add(M(new THREE.CylinderGeometry(r * 0.6, r, h, 9), toon({ color: '#8b8f86' }), [x, h / 2 - 3, z], { outline: 0.03 }));
    group.add(M(new THREE.SphereGeometry(r * 0.62, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#5f8a4a' }), [x, h - 3, z], { outline: 0.02 }));
    // Starfish and scallops clinging to each stack above the waterline.
    for (let k = 0; k < 4; k += 1) {
      const a = rand() * Math.PI * 2;
      const y = 1 + rand() * (h * 0.4);
      const rr = r - (r * 0.4 * (y + 3)) / h + 0.1;
      shells.add(k % 2 ? star : scallop, k % 2 ? starMats[k % 3] : scallopMats[k % 3], [x + Math.sin(a) * rr, y, z + Math.cos(a) * rr], [0, a, rand() * 6], 1.2 + rand(), 0.012);
    }
  }

  // ---- The sea's touch everywhere: shells, starfish, sand dollars and conches on the sand; coral along every
  // shore; kelp swaying in the shallows. Rejection-sampled from the shared seeded stream, so the layout never changes. ----
  const awayFromPaths = (x: number, z: number) =>
    Math.hypot(x - SEA_GATE.x, z - SEA_GATE.z) > 5
    && Math.hypot(x - OCEAN_ARRIVAL.x, z - OCEAN_ARRIVAL.z) > 3
    && Math.hypot(x - SHIPWRECK.x, z - SHIPWRECK.z) > SHIPWRECK.halfLength + 1
    && Math.abs(x) > CAUSEWAY.halfWidth - 1.5;
  for (let placed = 0, tries = 0; placed < 140 && tries < 4000; tries += 1) {
    const x = BEACH.x + (rand() * 2 - 1) * BEACH.rx;
    const z = BEACH.z + (rand() * 2 - 1) * BEACH.rz;
    const d = landDistance(x, z);
    if (d > -1 || !awayFromPaths(x, z)) continue;
    placed += 1;
    const yaw = rand() * Math.PI * 2;
    const kind = placed % 7;
    const y = oceanLocalHeight(x, z);
    if (kind <= 2) shells.add(scallop, scallopMats[placed % 3], [x, y + 0.08, z], [-Math.PI / 2 + 0.25, yaw, 0], 0.35 + rand() * 0.25, 0.006, false);
    else if (kind === 3) shells.add(star, starMats[placed % 3], [x, y + 0.06, z], [-Math.PI / 2, yaw, 0], 0.3 + rand() * 0.2, 0.006, false);
    else if (kind === 4) shells.add(sandDollar, dollar, [x, y + 0.04, z], [0, yaw, 0], 0.25 + rand() * 0.12, 0.004, false);
    else if (kind === 5) shells.add(conch, placed % 2 ? conchMat : conchRose, [x, y + 0.25, z], [0, yaw, Math.PI / 2 - 0.2], 0.28 + rand() * 0.15, 0.006, false);
    else shells.add(brain, coralMats[placed % 4], [x, y - 0.05, z], [0, yaw, 0], 0.25 + rand() * 0.2, 0.006, false);
  }
  // Giant clams on the beach, pearls glowing.
  // (The beach's giant clams are in GIANT_CLAMS, drawn with the courtyard's.)
  // Coral at the water's edge all round the beach, the causeway and the island.
  const coralBranch = Array.from({ length: 4 }, () => branchCoralGeometry(1, rand));
  for (let placed = 0, tries = 0; placed < 170 && tries < 8000; tries += 1) {
    const x = g.minX + rand() * (g.maxX - g.minX);
    const z = g.minZ + rand() * (g.maxZ - g.minZ);
    const d = landDistance(x, z);
    if (d < -0.8 || d > 2.5 || !awayFromPaths(x, z) || nearBridge(x, z, 2)) continue;
    placed += 1;
    const y = Math.max(-0.6, oceanLocalHeight(x, z));
    const mat = coralMats[placed % 4];
    if (placed % 3 === 0) shells.add(brain, mat, [x, y - 0.1, z], [0, rand() * 6, 0], 0.5 + rand() * 0.6, 0.008, false);
    else shells.add(coralBranch[placed % 4], mat, [x, y - 0.2, z], [(rand() - 0.5) * 0.3, rand() * 6, 0], 1.0 + rand() * 1.2, 0.006, false);
  }
  // Kelp: ribbons rising out of the sea round all the land, thicker by the island.
  const kelpGeos = Array.from({ length: 5 }, (_, k) => kelpGeometry(6 + k * 0.8, 0.55, k * 1.7));
  for (let placed = 0, tries = 0; placed < 220 && tries < 8000; tries += 1) {
    const x = g.minX - 10 + rand() * (g.maxX - g.minX + 20);
    const z = g.minZ - 10 + rand() * (g.maxZ - g.minZ + 20);
    const d = landDistance(x, z);
    if (d < 3 || d > 22) continue;
    if (Math.hypot(x - KRAKEN.x, z - KRAKEN.z) < 14 * KRAKEN.scale) continue;
    if (nearBridge(x, z, 8)) continue; // tall kelp would poke up through the risen bridge
    placed += 1;
    for (let k = 0; k < 3; k += 1) {
      shells.add(kelpGeos[(placed + k) % 5], k === 2 ? kelpGold : kelpMat, [x + (rand() - 0.5) * 1.5, -4 - rand() * 1.5, z + (rand() - 0.5) * 1.5], [0, rand() * 6, 0], 0.8 + rand() * 0.5, false, false);
    }
  }
  shells.flush(look, group);

  // The kraken freed (Nov 16): yaw then tilt, so he can lean forward toward the gods.
  kraken.rotation.order = 'YXZ';
  const restYaw = kraken.rotation.y;
  const godsSpot = krakenFreedPoints({ x: 0, y: 0, z: 0 }).gods;
  const bowYaw = Math.atan2(godsSpot.x - OCEAN.center.x - KRAKEN.x, godsSpot.z - OCEAN.center.z - KRAKEN.z);
  const beat = (name: keyof typeof KRAKEN_FREED_BEATS) => KRAKEN_FREED_BEATS[name] / TICK_HZ;
  const smooth = (x: number) => {
    const k = Math.min(1, Math.max(0, x));
    return k * k * (3 - 2 * k);
  };
  const conduitColor = conduitMat.color.clone();
  let krakenState: { t: number | null; freed: boolean } = { t: null, freed: false };

  let active = false;
  return {
    group,
    setActive(on) {
      active = on;
      group.visible = on;
    },
    setKraken(state) {
      krakenState = state;
    },
    setVillage(state) {
      bridgeState = state;
    },
    update(time, reduceMotion) {
      if (!active) return;
      // The kraken strains slowly against his chains; the conduit pulses gently (never a flash).
      const amount = reduceMotion ? 0.3 : 1;
      const { t: st, freed } = krakenState;
      const sceneT = st ?? (freed ? Infinity : -1);
      // Rising out of the sea, then bowing his head to the gods; once free he stays up, calmer.
      const rise = smooth((sceneT - beat('rise')) / 2.5);
      const bow = smooth((sceneT - beat('bow')) / 1.6) * (1 - smooth((sceneT - beat('end') + 2.5) / 2.5));
      const turn = smooth((sceneT - beat('rise')) / 4);
      const free = sceneT > beat('rise');
      for (const t of tentacles) t.mesh.rotation.y = Math.sin(time * (free ? 0.9 : 0.5) + t.phase) * (free ? 0.12 : 0.05) * amount;
      kraken.position.y = Math.sin(time * 0.6) * 0.25 * amount + rise * 4.5;
      kraken.rotation.y = restYaw + Math.atan2(Math.sin(bowYaw - restYaw), Math.cos(bowYaw - restYaw)) * turn;
      kraken.rotation.x = bow * 0.42;
      // The village bridge rises out of the sea over 4 s (eased; lanterns on once it's up).
      const bt = bridgeState.bridgeT;
      const risen = bt === null ? 0 : smooth(bt / 4);
      bridgeGroup.position.y = BRIDGE_SUNK * (1 - risen) + (bt !== null && bt < 4 && !reduceMotion ? Math.sin(bt * 9) * 0.04 * (1 - risen) : 0);
      bridgeGroup.visible = risen > 0.001;
      lanternMat.emissiveIntensity = 0.9 + Math.sin(time * 1.3) * 0.15 * amount;
      // The rig dies: its glow sputters out (a slow flicker, never a flash) and stays dark.
      const rigOff = sceneT - beat('rig');
      if (rigOff < 0) {
        conduitMat.emissiveIntensity = 0.9 + Math.sin(time * (reduceMotion ? 0.8 : 2.2)) * 0.25 * amount;
        conduitMat.color.copy(conduitColor);
      } else {
        const fading = 1 - smooth(rigOff / 2);
        conduitMat.emissiveIntensity = 0.9 * fading * (0.6 + 0.4 * Math.abs(Math.sin(rigOff * (reduceMotion ? 3 : 9))));
        conduitMat.color.copy(conduitColor).multiplyScalar(0.2 + 0.8 * fading);
      }
      // The chains snap one after another and drop into the sea.
      [...chains, ...drainCables].forEach((chain, i) => {
        const since = sceneT - beat('chains') - (i * CHAIN_SNAP_GAP) / TICK_HZ;
        chain.visible = since < 1.6;
        chain.position.y = since > 0 ? -since * since * 4 : 0;
      });
      // The door's shell breathes sea-blue light (slow, never a flash).
      doorShellMat.emissiveIntensity = 1.5 + Math.sin(time * 1.4) * 0.35 * amount;
      doorGlow.intensity = 28 + Math.sin(time * 1.4) * 6 * amount;
    },
  };
}
