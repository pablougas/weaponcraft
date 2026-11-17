import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OCEAN } from '../../sim/regions';
import { rng } from '../../sim/rng';
import { fbm } from '../../sim/terrain/noise';
import {
  BEACH,
  CASTLE,
  CASTLE_GATE_HALF,
  CASTLE_TOWERS,
  CASTLE_WALL,
  castleWallSegments,
  CAUSEWAY,
  KEEP,
  KRAKEN,
  KRAKEN_RIG,
  landDistance,
  OCEAN_GRID,
  oceanLocalHeight,
  OCEAN_ARRIVAL,
  SEA_GATE,
  SHIPWRECK,
  STATUE,
  TEMPLES,
  TOWER,
  wallSegmentLength,
} from '../../sim/terrain/ocean';
import { brainCoralGeometry, branchCoralGeometry, clamGeometry, conchGeometry, kelpGeometry, sandDollarGeometry, scallopGeometry, ShellBatch, starfishGeometry } from './shells';
import type { Look } from '../look';

export interface OceanView {
  group: THREE.Group;
  setActive(active: boolean): void;
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
      // The avenue from the gate to the keep stays plain pearl.
      if (Math.abs(x - CASTLE.x) < 4.5 && z > KEEP.z) c.copy(paving);
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
  const ringArc = (radius: number, tube: number) => {
    const ring = new THREE.TorusGeometry(radius, tube, 4, 150, Math.PI * 2 - gap * 2);
    ring.rotateX(Math.PI / 2);
    ring.rotateY(-(Math.PI / 2 + gap));
    return ring;
  };
  for (const side of [-1.15, 1.15]) {
    group.add(M(ringArc(CASTLE_WALL.radius + side, 0.18), gold, [CASTLE.x, baseY + H - 1.2, CASTLE.z], { outline: false, cast: false }));
    group.add(M(ringArc(CASTLE_WALL.radius + side, 0.45), teal, [CASTLE.x, baseY + 2.4, CASTLE.z], { outline: false, cast: false }));
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
  for (const side of [-1, 1]) {
    group.add(M(new THREE.CylinderGeometry(1.6, 1.9, H + 6, 16), marble, at(side * pillarX, gateZ, (H + 6) / 2 - 0.4), { outline: 0.02 }));
    shells.add(conch, conchMat, at(side * pillarX, gateZ, H + 5.6), [0, side, 0], 1.6, 0.016);
  }
  group.add(M(new THREE.TorusGeometry(pillarX, 0.9, 8, 36, Math.PI), marble, at(0, gateZ, H + 2), { outline: 0.02 }));
  shells.add(scallop, shellPink, at(0, gateZ + 0.8, H + 2 + pillarX * 0.6), [0, 0, 0], 5.2, 0.025);
  group.add(M(new THREE.SphereGeometry(0.9, 16, 12), pearl, at(0, gateZ + 1.5, H + 2 + pillarX * 0.6 + 1), { outline: 0.01 }));
  group.add(M(new THREE.PlaneGeometry(3.2, 7), banner, at(0, gateZ + 1.2, H - 2), { outline: false }));
  // The avenue: paired columns from the gate to the keep, each topped with a cream scallop.
  const avenue: THREE.BufferGeometry[] = [];
  for (let z = gateZ - 8; z > KEEP.z + KEEP.radius + 8; z -= 9) {
    if (Math.abs(z - STATUE.z) < STATUE.radius + 3) continue;
    for (const side of [-1, 1]) {
      const col = new THREE.CylinderGeometry(0.55, 0.65, 8, 10);
      col.translate(side * 7.5, oceanLocalHeight(side * 7.5, z) + 3.8, z);
      avenue.push(col);
      shells.add(scallop, shellCream, at(side * 7.5, z, 7.8), [0, -side * Math.PI / 2, 0], 1.1, 0.01);
    }
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
  group.add(M(new THREE.CylinderGeometry(KR + 3, KR + 3.4, 1.4, 40), marbleShade, [KEEP.x, ky + 0.3, KEEP.z], { outline: 0.018 }));
  group.add(M(new THREE.CylinderGeometry(KR, KR + 0.6, 22, 40), marble, [KEEP.x, ky + 11, KEEP.z], { outline: 0.025 }));
  const columns: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const col = new THREE.CylinderGeometry(0.6, 0.7, 20, 10);
    col.translate(KEEP.x + Math.sin(a) * (KR + 1.8), ky + 10.6, KEEP.z + Math.cos(a) * (KR + 1.8));
    columns.push(col);
    if (i % 2 === 0) shells.add(scallop, scallopMats[(i / 2) % 3], [KEEP.x + Math.sin(a) * (KR + 0.3), ky + 15, KEEP.z + Math.cos(a) * (KR + 0.3)], [0, a, 0], 1.8, 0.012);
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
  const doorZ = KEEP.z + KR + 0.4;
  group.add(M(new THREE.BoxGeometry(4.4, 7, 0.6), woodDark, [KEEP.x, ky + 3.5, doorZ], { outline: 0.014 }));
  shells.add(scallop, shellPink, [KEEP.x, ky + 7.4, doorZ + 0.5], [0, 0, 0], 2.8, 0.014);
  for (const side of [-1, 1]) group.add(M(new THREE.PlaneGeometry(2.2, 6.5), banner, [KEEP.x + side * 5, ky + 9, doorZ + 1.6], { outline: false }));
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
  for (const [x, z, yaw] of [[-20, CASTLE.z + 40, 0.4], [-38, CASTLE.z - 8, -0.6], [36, CASTLE.z + 22, 2.4], [-16, CASTLE.z + 12, 1.1], [16, CASTLE.z - 40, 0.2], [-40, CASTLE.z + 18, 2]] as const) {
    group.add(M(new THREE.ConeGeometry(2.4, 3, 4), canvas, at(x, z, 1.5), { rot: [0, yaw, 0], outline: 0.012 }));
  }
  for (let i = 0; i < 14; i += 1) {
    const x = (i % 2 ? 1 : -1) * (12 + rand() * 10);
    const z = CASTLE.z + 26 + rand() * 18;
    const s = 0.7 + rand() * 0.4;
    group.add(M(new THREE.BoxGeometry(s, s, s), wood, at(x, z, s / 2), { rot: [0, rand() * 3, 0], outline: 0.01 }));
  }
  for (const sa of [-1.1, 2.2]) {
    const scaffold = new THREE.Group();
    for (const dx of [-3, 3]) for (const dz of [-1, 1]) scaffold.add(M(new THREE.BoxGeometry(0.25, H, 0.25), wood, [dx, H / 2, dz], { outline: 0.006 }));
    for (const y of [H * 0.33, H * 0.66, H - 0.5]) scaffold.add(M(new THREE.BoxGeometry(6.6, 0.2, 2.3), wood, [0, y, 0], { outline: 0.008 }));
    scaffold.position.set(CASTLE.x + Math.sin(sa) * (CASTLE_WALL.radius - 2.8), baseY, CASTLE.z + Math.cos(sa) * (CASTLE_WALL.radius - 2.8));
    scaffold.rotation.y = sa;
    group.add(scaffold);
  }
  // Giant clams in the courtyard's corners, pearls glowing.
  for (const [x, z, yaw] of [[-36, CASTLE.z + 30, 0.6], [36, CASTLE.z + 32, -0.6], [-12, CASTLE.z - 42, 0.2]] as const) giantClam(x, z, 2.2, yaw);

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
  for (const [dz, dy] of [[-4, 10], [4, 7]] as const) {
    const end = new THREE.Vector3(KRAKEN.x - 9 * KRAKEN.scale, 6 + dy * 0.6, KRAKEN.z + dz);
    group.add(M(new THREE.TubeGeometry(cablePath(rigTop, end, -6), 40, 0.24, 6), conduitMat, [0, 0, 0], { outline: false, cast: false }));
  }

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
  const chainLinks: THREE.BufferGeometry[] = [];
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
      chainLinks.push(link);
    }
  });
  if (chainLinks.length) group.add(M(mergeGeometries(chainLinks), iron, [0, 0, 0], { outline: false }));

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
  for (const [x, z, r, yaw] of [[22, 30, 1.4, -0.8], [-6, 34, 1.1, 0.3], [26, 20, 0.9, -1.4]] as const) giantClam(x, z, r, yaw);
  // Coral at the water's edge all round the beach, the causeway and the island.
  const coralBranch = Array.from({ length: 4 }, () => branchCoralGeometry(1, rand));
  for (let placed = 0, tries = 0; placed < 170 && tries < 8000; tries += 1) {
    const x = g.minX + rand() * (g.maxX - g.minX);
    const z = g.minZ + rand() * (g.maxZ - g.minZ);
    const d = landDistance(x, z);
    if (d < -0.8 || d > 2.5 || !awayFromPaths(x, z)) continue;
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
    placed += 1;
    for (let k = 0; k < 3; k += 1) {
      shells.add(kelpGeos[(placed + k) % 5], k === 2 ? kelpGold : kelpMat, [x + (rand() - 0.5) * 1.5, -4 - rand() * 1.5, z + (rand() - 0.5) * 1.5], [0, rand() * 6, 0], 0.8 + rand() * 0.5, false, false);
    }
  }
  shells.flush(look, group);

  let active = false;
  return {
    group,
    setActive(on) {
      active = on;
      group.visible = on;
    },
    update(time, reduceMotion) {
      if (!active) return;
      // The kraken strains slowly against his chains; the conduit pulses gently (never a flash).
      const amount = reduceMotion ? 0.3 : 1;
      for (const t of tentacles) t.mesh.rotation.y = Math.sin(time * 0.5 + t.phase) * 0.05 * amount;
      kraken.position.y = Math.sin(time * 0.6) * 0.25 * amount;
      conduitMat.emissiveIntensity = 0.9 + Math.sin(time * (reduceMotion ? 0.8 : 2.2)) * 0.25 * amount;
    },
  };
}
