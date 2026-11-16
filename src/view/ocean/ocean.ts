import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OCEAN } from '../../sim/regions';
import { rng } from '../../sim/rng';
import { fbm } from '../../sim/terrain/noise';
import {
  BEACH,
  CASTLE,
  CASTLE_TOWERS,
  CASTLE_WALL,
  castleWallSegments,
  KEEP,
  KRAKEN,
  KRAKEN_RIG,
  landDistance,
  OCEAN_GRID,
  oceanLocalHeight,
  SHIPWRECK,
} from '../../sim/terrain/ocean';
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
  const wet = new THREE.Color('#a8956a');
  const paving = new THREE.Color('#cfdad8');
  const pavingB = new THREE.Color('#aebfc0');
  const seabed = new THREE.Color('#2d6f74');
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const h = oceanLocalHeight(x, z);
    gp.setY(i, h);
    const d = landDistance(x, z);
    const inCastle = Math.hypot(x - CASTLE.x, z - CASTLE.z) < CASTLE_WALL.radius + 1.5 || (Math.abs(x) < 3.2 && z < 12 && d < -1);
    if (inCastle) c.copy(paving).lerp(pavingB, fbm(x * 0.3, z * 0.3));
    else c.copy(sand).lerp(sandB, fbm(x * 0.09 + 3, z * 0.09));
    c.lerp(wet, THREE.MathUtils.smoothstep(d, -3, 0.5));
    if (h < -0.2) c.copy(seabed);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  const groundMesh = new THREE.Mesh(ground, toon({ vertexColors: true, grad: look.GRAD4, rim: false }));
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  const marble = toon({ color: '#e3ecec' });
  const marbleShade = toon({ color: '#b9cacc' });
  const teal = toon({ color: '#2f9a9a' });
  const gold = toon({ color: '#d8b04a', emissive: '#5a3f08', emissiveIntensity: 0.2 });
  const wood = toon({ color: '#6a4a33' });
  const woodDark = toon({ color: '#4a3324' });
  const iron = toon({ color: '#3d3f4a' });
  const banner = toon({ color: '#9b2b2b', side: THREE.DoubleSide, rim: false });
  const canvas = toon({ color: '#e7dcc3', side: THREE.DoubleSide, rim: false });
  const conduitMat = toon({ color: '#6fd8d0', emissive: '#2fb8b0', emissiveIntensity: 0.9, rim: false });
  const at = (x: number, z: number, lift = 0): [number, number, number] => [x, oceanLocalHeight(x, z) + lift, z];

  // ---- Atlantis: the curtain wall, its towers, the gate and the domed keep. ----
  const wallParts: THREE.BufferGeometry[] = [];
  const crenels: THREE.BufferGeometry[] = [];
  const baseY = oceanLocalHeight(CASTLE.x, CASTLE.z);
  for (const seg of castleWallSegments()) {
    const wall = new THREE.BoxGeometry(4.5, CASTLE_WALL.height, 1.6);
    wall.rotateY(seg.yaw);
    wall.translate(seg.x, baseY + CASTLE_WALL.height / 2 - 0.4, seg.z);
    wallParts.push(wall);
    for (const off of [-1.5, 0, 1.5]) {
      const merlon = new THREE.BoxGeometry(0.8, 0.8, 1.7);
      merlon.translate(off, 0, 0);
      merlon.rotateY(seg.yaw);
      merlon.translate(seg.x, baseY + CASTLE_WALL.height, seg.z);
      crenels.push(merlon);
    }
  }
  group.add(M(mergeGeometries(wallParts), marble, [0, 0, 0], { outline: 0.02 }));
  group.add(M(mergeGeometries(crenels), marbleShade, [0, 0, 0], { outline: 0.012 }));
  // A gold band along the wall top.
  const band = new THREE.TorusGeometry(CASTLE_WALL.radius, 0.12, 4, 96);
  band.rotateX(Math.PI / 2);
  group.add(M(band, gold, [CASTLE.x, baseY + CASTLE_WALL.height - 0.9, CASTLE.z], { outline: false, cast: false }));
  for (const tower of CASTLE_TOWERS) {
    const ty = oceanLocalHeight(tower.x, tower.z);
    group.add(M(new THREE.CylinderGeometry(2.2, 2.6, 12, 14), marble, [tower.x, ty + 5.6, tower.z], { outline: 0.02 }));
    group.add(M(new THREE.ConeGeometry(2.9, 4.2, 14), teal, [tower.x, ty + 13.6, tower.z], { outline: 0.02 }));
    group.add(M(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), gold, [tower.x, ty + 16.4, tower.z], { outline: false }));
    // The humans' banner hung over the Atlantean stone.
    const facing = Math.atan2(tower.x - CASTLE.x, tower.z - CASTLE.z);
    group.add(M(new THREE.PlaneGeometry(1.3, 3.2), banner, [tower.x + Math.sin(facing) * 2.45, ty + 8, tower.z + Math.cos(facing) * 2.45], { rot: [0, facing, 0], outline: false }));
  }
  // The gate: two pillars and an arch over the opening, toward the causeway.
  const gateZ = CASTLE.z + CASTLE_WALL.radius;
  for (const side of [-1, 1]) {
    group.add(M(new THREE.CylinderGeometry(0.75, 0.9, 9, 12), marble, at(side * 6.6, gateZ, 4.1), { outline: 0.016 }));
    group.add(M(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), teal, at(side * 6.6, gateZ, 8.6), { outline: 0.012 }));
  }
  group.add(M(new THREE.TorusGeometry(6.6, 0.55, 8, 28, Math.PI), marble, at(0, gateZ, 8.2), { outline: 0.02 }));
  group.add(M(new THREE.PlaneGeometry(2.2, 4.5), banner, at(0, gateZ + 0.1, 11.4), { outline: false }));
  // The keep: a drum of columns under a great teal dome with a gold trident.
  const ky = oceanLocalHeight(KEEP.x, KEEP.z);
  group.add(M(new THREE.CylinderGeometry(KEEP.radius, KEEP.radius + 0.6, 12, 24), marble, [KEEP.x, ky + 5.6, KEEP.z], { outline: 0.02 }));
  const columns: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const col = new THREE.CylinderGeometry(0.35, 0.4, 11, 8);
    col.translate(KEEP.x + Math.sin(a) * (KEEP.radius + 0.9), ky + 5.5, KEEP.z + Math.cos(a) * (KEEP.radius + 0.9));
    columns.push(col);
  }
  group.add(M(mergeGeometries(columns), marbleShade, [0, 0, 0], { outline: 0.01 }));
  group.add(M(new THREE.CylinderGeometry(KEEP.radius + 1.5, KEEP.radius + 1.5, 0.7, 24), marble, [KEEP.x, ky + 11.4, KEEP.z], { outline: 0.015 }));
  group.add(M(new THREE.SphereGeometry(KEEP.radius + 0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), teal, [KEEP.x, ky + 11.7, KEEP.z], { outline: 0.02 }));
  group.add(M(new THREE.CylinderGeometry(0.12, 0.12, 3.6, 6), gold, [KEEP.x, ky + 20, KEEP.z], { outline: false }));
  for (const x of [-0.6, 0, 0.6]) group.add(M(new THREE.ConeGeometry(0.16, 0.8, 5), gold, [KEEP.x + x, ky + (x === 0 ? 22.2 : 21.9), KEEP.z], { outline: 0.006 }));
  group.add(M(new THREE.BoxGeometry(1.4, 0.15, 0.2), gold, [KEEP.x, ky + 21.5, KEEP.z], { outline: false }));
  // The keep's door, toward the gate, and the humans' banner beside it.
  group.add(M(new THREE.BoxGeometry(2.6, 4, 0.4), woodDark, [KEEP.x, ky + 2, KEEP.z + KEEP.radius + 0.35], { outline: 0.012 }));
  group.add(M(new THREE.PlaneGeometry(1.2, 3), banner, [KEEP.x + 2.4, ky + 6.5, KEEP.z + KEEP.radius + 1.0], { outline: false }));

  // Human occupation: tents and crates in the courtyard, a scaffold on the wall.
  for (const [x, z, yaw] of [[-12, CASTLE.z + 4, 0.4], [-8, CASTLE.z - 12, -0.6], [10, CASTLE.z + 10, 2.4]] as const) {
    const tent = new THREE.ConeGeometry(2, 2.6, 4);
    group.add(M(tent, canvas, at(x, z, 1.3), { rot: [0, yaw, 0], outline: 0.012 }));
  }
  for (let i = 0; i < 6; i += 1) {
    const x = -4 + rand() * 8 + (i % 2 ? 8 : -8);
    const z = CASTLE.z + 6 + rand() * 6;
    const s = 0.7 + rand() * 0.3;
    group.add(M(new THREE.BoxGeometry(s, s, s), wood, at(x, z, s / 2), { rot: [0, rand() * 3, 0], outline: 0.01 }));
  }
  const scaffold = new THREE.Group();
  for (const dx of [-2, 2]) for (const dz of [-0.8, 0.8]) scaffold.add(M(new THREE.BoxGeometry(0.2, 7, 0.2), wood, [dx, 3.5, dz], { outline: 0.006 }));
  for (const y of [2.4, 4.8]) scaffold.add(M(new THREE.BoxGeometry(4.6, 0.18, 1.9), wood, [0, y, 0], { outline: 0.008 }));
  const sa = -1.1;
  scaffold.position.set(CASTLE.x + Math.sin(sa) * (CASTLE_WALL.radius - 2.4), baseY, CASTLE.z + Math.cos(sa) * (CASTLE_WALL.radius - 2.4));
  scaffold.rotation.y = sa;
  group.add(scaffold);

  // ---- The rig: iron frame and glowing conduit, cables out over the wall to the kraken. ----
  const rig = new THREE.Group();
  rig.position.set(...at(KRAKEN_RIG.x, KRAKEN_RIG.z));
  rig.add(M(new THREE.BoxGeometry(3.2, 0.4, 2.2), iron, [0, 0.2, 0], { outline: 0.012 }));
  for (const [x, z] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) rig.add(M(new THREE.BoxGeometry(0.22, 4.2, 0.22), iron, [x, 2.1, z], { outline: 0.008 }));
  rig.add(M(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 12), conduitMat, [0, 2.1, 0], { outline: 0.012 }));
  rig.add(M(new THREE.BoxGeometry(3.4, 0.3, 2.4), iron, [0, 4.3, 0], { outline: 0.01 }));
  group.add(rig);
  const cablePath = (from: THREE.Vector3, to: THREE.Vector3, sag: number) => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y -= sag;
    return new THREE.QuadraticBezierCurve3(from, mid, to);
  };
  const rigTop = new THREE.Vector3(KRAKEN_RIG.x, oceanLocalHeight(KRAKEN_RIG.x, KRAKEN_RIG.z) + 4.4, KRAKEN_RIG.z);
  for (const [dz, dy] of [[-2.5, 6], [2.5, 4.5]] as const) {
    const end = new THREE.Vector3(KRAKEN.x - 6, 5 + dy * 0.3, KRAKEN.z + dz);
    group.add(M(new THREE.TubeGeometry(cablePath(rigTop, end, -3), 28, 0.16, 6), conduitMat, [0, 0, 0], { outline: false, cast: false }));
  }

  // ---- Poseidon's kraken, chained in the sea beside the castle. ----
  const kraken = new THREE.Group();
  kraken.position.set(KRAKEN.x, 0, KRAKEN.z);
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
  const posts = [
    { x: CASTLE.x + 24, z: CASTLE.z - 8 },
    { x: CASTLE.x + 25, z: CASTLE.z + 4 },
    { x: CASTLE.x + 21, z: CASTLE.z + 14 },
    { x: CASTLE.x + 20, z: CASTLE.z - 16 },
  ];
  anchors.forEach((local, i) => {
    const from = local.clone().applyMatrix4(kraken.matrix);
    const post = posts[i % posts.length];
    const py = oceanLocalHeight(post.x, post.z);
    group.add(M(new THREE.CylinderGeometry(0.45, 0.6, 3.2, 8), iron, [post.x, py + 1.4, post.z], { outline: 0.01 }));
    const to = new THREE.Vector3(post.x, py + 2.6, post.z);
    const curve = cablePath(from, to, 2.5);
    const length = curve.getLength();
    const links = Math.floor(length / 0.55);
    for (let k = 0; k <= links; k += 1) {
      const t = k / links;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const link = new THREE.TorusGeometry(0.28, 0.08, 5, 10);
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
  const coralMats = [toon({ color: '#e0705f' }), toon({ color: '#b84d7a' }), toon({ color: '#f0a64a' })];
  for (let i = 0; i < 26; i += 1) {
    const a = rand() * Math.PI * 2;
    const x = Math.sin(a) * (BEACH.rx - 1) + (rand() - 0.5) * 3;
    const z = BEACH.z + Math.cos(a) * (BEACH.rz - 1);
    if (Math.abs(x) < 6 && z < 16) continue;
    const s = 0.4 + rand() * 0.6;
    group.add(M(new THREE.ConeGeometry(0.25 * s, 1.4 * s, 5), coralMats[i % 3], at(x, z, 0.4 * s), { rot: [(rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6], outline: 0.006, cast: false }));
  }
  // Sea stacks out in the water, so the horizon isn't empty.
  for (const [x, z, r, h] of [[-60, -40, 6, 18], [-85, 30, 9, 26], [70, 10, 7, 20], [55, -120, 10, 30], [-40, -130, 8, 22]] as const) {
    group.add(M(new THREE.CylinderGeometry(r * 0.6, r, h, 9), toon({ color: '#8b8f86' }), [x, h / 2 - 3, z], { outline: 0.03 }));
    group.add(M(new THREE.SphereGeometry(r * 0.62, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#5f8a4a' }), [x, h - 3, z], { outline: 0.02 }));
  }

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
