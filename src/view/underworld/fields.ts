import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FREED_BEATS, freedPoints } from '../../sim/cutscenes/freed';
import { GROTTO } from '../../sim/regions';
import { fbm } from '../../sim/terrain/noise';
import {
  BEACON, CERBERUS_HOUND, CERBERUS_POST, FIELDS, FIELDS_CELL, FORT_SPOTS, GATE_PILLARS, GATES, MECH_SIZE, POWER_PYLON, SPIRES, TUNNEL,
  palisadeSegments, pathX, riverZ, spireBase, underworldLocalHeight, watchtowerSpot,
} from '../../sim/terrain/underworld';
import type { Look } from '../look';

export interface FieldsView {
  group: THREE.Group;
  setActive(active: boolean): void;
  update(time: number, camera: THREE.Camera, reduceMotion: boolean): void;
  /**
   * The Mk. II's back (world position and heading), so the pylon's beam follows it; null hides the beam.
   * `freedT` is seconds into the freeing scene (null outside it); `freed` once Cerberus is free.
   */
  setGates(state: { mech: { x: number; y: number; z: number; yaw: number } | null; freedT: number | null; freed: boolean }): void;
}

/** Seeded random for scenery (view-only: not world state). */
function scenery(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The tunnel and the Asphodel Fields (SPEC §3.5, M6): a vast cavern of grey
 * asphodel meadows, the Styx, bone-white spires and crystal veins, with the
 * glowing conduit running to the Gates, where Cerberus Mk. II stands wired to
 * the chained hound. All in the grotto's coordinates (the group sits at its centre).
 */
export function buildFields(look: Look): FieldsView {
  const { M, toon } = look;
  const group = new THREE.Group();
  group.position.set(GROTTO.center.x, GROTTO.center.y, GROTTO.center.z);
  const rand = scenery(0xa5f0d1);
  const h = underworldLocalHeight;

  // Ground: the same grid as the collider, coloured by height, meadow and river.
  const maxZ = TUNNEL.toZ + 22;
  const nx = Math.round((FIELDS.maxX - FIELDS.minX) / FIELDS_CELL);
  const nz = Math.round((maxZ - FIELDS.minZ) / FIELDS_CELL);
  const ground = new THREE.PlaneGeometry(nx * FIELDS_CELL, nz * FIELDS_CELL, nx, nz);
  ground.rotateX(-Math.PI / 2);
  ground.translate(FIELDS.minX + (nx * FIELDS_CELL) / 2, 0, FIELDS.minZ + (nz * FIELDS_CELL) / 2);
  const gp = ground.attributes.position;
  const colors = new Float32Array(gp.count * 3);
  const ash = new THREE.Color('#6a6082');
  const meadow = new THREE.Color('#7f8798');
  const moss = new THREE.Color('#4a7a76');
  const cliff = new THREE.Color('#3a3150');
  const bank = new THREE.Color('#2b3f48');
  const highland = new THREE.Color('#a49ac4');
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i += 1) gp.setY(i, h(gp.getX(i), gp.getZ(i)));
  ground.computeVertexNormals();
  const normals = ground.attributes.normal;
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const y = gp.getY(i);
    c.copy(ash).lerp(meadow, fbm(x * 0.03, z * 0.03 + 5)).lerp(moss, Math.max(0, fbm(x * 0.02 + 9, z * 0.02) - 0.55) * 2);
    // Higher ledges go paler (dusted with ash); steep risers and cliffs are dark rock.
    if (y > 3) c.lerp(highland, Math.min(0.7, (y - 3) / 30));
    const steep = 1 - normals.getY(i);
    if (steep > 0.1) c.lerp(cliff, Math.min(1, (steep - 0.1) * 5));
    if (Math.abs(z - riverZ(x)) < 14) c.lerp(bank, 0.6);
    if (Math.abs(x - pathX(z)) < 3 && z < TUNNEL.toZ) c.lerp(new THREE.Color('#6a5f78'), 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const groundMesh = new THREE.Mesh(ground, toon({ vertexColors: true, grad: look.GRAD4, rim: false }));
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // The tunnel: walls and a low ceiling, crystal-studded, out to the fields.
  const rock = toon({ color: '#3a2f52', rim: false });
  const tunnelLength = TUNNEL.fromZ - TUNNEL.toZ + 4;
  const tunnelMid = (TUNNEL.fromZ + TUNNEL.toZ) / 2 - 2;
  for (const side of [-1, 1]) {
    group.add(M(new THREE.BoxGeometry(1.2, 7, tunnelLength), rock, [side * (TUNNEL.halfWidth + 0.6), 3.5, tunnelMid], { outline: false }));
  }
  group.add(M(new THREE.BoxGeometry(TUNNEL.halfWidth * 2 + 2.4, 1, tunnelLength), rock, [0, 6.4, tunnelMid], { outline: false, cast: false }));

  // Rock walls around the fields' edge, so the cavern feels closed.
  const wallMat = toon({ color: '#2a2238', rim: false, side: THREE.BackSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 90, 48, 1, true), wallMat);
  wall.scale.set((FIELDS.maxX - FIELDS.minX) / 2 + 10, 1, (FIELDS.maxZ - FIELDS.minZ) / 2 + 10);
  wall.position.set(0, 30, (FIELDS.minZ + FIELDS.maxZ) / 2);
  group.add(wall);

  // The Styx: a dark, softly glowing ribbon of water following the channel.
  const waterMat = toon({ color: '#0d2a33', emissive: '#1a7f80', emissiveIntensity: 0.45, rim: false, transparent: true, opacity: 0.88 });
  const riverPoints: THREE.Vector3[] = [];
  for (let x = FIELDS.minX + 10; x <= FIELDS.maxX - 10; x += 6) riverPoints.push(new THREE.Vector3(x, -1.5, riverZ(x)));
  const riverShape = new THREE.BufferGeometry();
  const rv: number[] = [];
  const ri: number[] = [];
  riverPoints.forEach((p, i) => {
    const next = riverPoints[Math.min(riverPoints.length - 1, i + 1)];
    const prev = riverPoints[Math.max(0, i - 1)];
    const dir = new THREE.Vector3().subVectors(next, prev).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(9.5);
    rv.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    if (i > 0) {
      const a = (i - 1) * 2;
      ri.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  riverShape.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3));
  riverShape.setIndex(ri);
  riverShape.computeVertexNormals();
  group.add(new THREE.Mesh(riverShape, waterMat));

  // Bone-white spires.
  const bone = toon({ color: '#d9d2c3' });
  const spireGeo = new THREE.ConeGeometry(1, 1, 7);
  spireGeo.translate(0, 0.5, 0);
  const spires = new THREE.InstancedMesh(spireGeo, bone, SPIRES.length * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let k = 0;
  for (const spire of SPIRES) {
    const base = spireBase(spire);
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, rand() * 6, (rand() - 0.5) * 0.12));
    m4.compose(new THREE.Vector3(spire.x, base, spire.z), q, new THREE.Vector3(spire.radius, spire.height, spire.radius));
    spires.setMatrixAt(k++, m4);
    // A smaller companion spire beside it.
    const a = rand() * Math.PI * 2;
    const sx = spire.x + Math.cos(a) * spire.radius * 1.6;
    const sz = spire.z + Math.sin(a) * spire.radius * 1.6;
    m4.compose(new THREE.Vector3(sx, spireBase({ x: sx, z: sz, radius: spire.radius * 0.5, height: 0 }) + 0.5, sz), q, new THREE.Vector3(spire.radius * 0.5, spire.height * 0.45, spire.radius * 0.5));
    spires.setMatrixAt(k++, m4);
  }
  spires.castShadow = true;
  spires.receiveShadow = true;
  group.add(spires);

  // Crystal clusters scattered on the ground and along the cliffs.
  const crystalGeo = (() => {
    const body = new THREE.CylinderGeometry(0.5, 0.42, 1, 6);
    body.translate(0, 0.5, 0);
    const tip = new THREE.ConeGeometry(0.5, 0.55, 6);
    tip.translate(0, 1.275, 0);
    const merged = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
    merged.computeVertexNormals();
    return merged;
  })();
  const crystalMats = [
    toon({ color: '#7fe0d6', emissive: '#2fb8aa', emissiveIntensity: 0.8, rim: false }),
    toon({ color: '#b89ae8', emissive: '#6a44c0', emissiveIntensity: 0.8, rim: false }),
  ];
  const crystalCount = 260;
  const crystalMeshes = crystalMats.map((mat) => new THREE.InstancedMesh(crystalGeo, mat, crystalCount));
  const counts = [0, 0];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 120; i += 1) {
    const edgeCluster = i < 70;
    let x: number;
    let z: number;
    if (edgeCluster) {
      // Around the cliffs.
      const t = rand();
      const side = Math.floor(rand() * 3);
      x = side === 0 ? FIELDS.minX + 28 + rand() * 6 : side === 1 ? FIELDS.maxX - 28 - rand() * 6 : FIELDS.minX + 30 + t * (FIELDS.maxX - FIELDS.minX - 60);
      z = side === 2 ? FIELDS.minZ + 28 + rand() * 6 : FIELDS.minZ + 40 + t * (FIELDS.maxZ - FIELDS.minZ - 60);
    } else {
      x = FIELDS.minX + 40 + rand() * (FIELDS.maxX - FIELDS.minX - 80);
      z = FIELDS.minZ + 40 + rand() * (FIELDS.maxZ - FIELDS.minZ - 100);
      if (Math.abs(x - pathX(z)) < 8) continue;
    }
    const kind = i % 2;
    const size = edgeCluster ? 2 + rand() * 4 : 0.8 + rand() * 1.8;
    for (let j = 0; j < 4 && counts[kind] < crystalCount; j += 1) {
      const dir = new THREE.Vector3((rand() - 0.5) * 0.9, 1, (rand() - 0.5) * 0.9).normalize();
      const s = size * (0.5 + rand() * 0.7);
      const px = x + (rand() - 0.5) * size;
      const pz = z + (rand() - 0.5) * size;
      q.setFromUnitVectors(up, dir);
      m4.compose(new THREE.Vector3(px, h(px, pz) - 0.2, pz), q, new THREE.Vector3(s * 0.38, s, s * 0.38));
      crystalMeshes[kind].setMatrixAt(counts[kind]++, m4);
    }
  }
  crystalMeshes.forEach((mesh, i) => {
    mesh.count = counts[i];
    group.add(mesh);
  });

  // Grey asphodel flowers in drifts across the meadows.
  const flowerMat = toon({ color: '#cfcad6', emissive: '#6d6380', emissiveIntensity: 0.3, rim: false });
  const flowers = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.38, 5), flowerMat, 6000);
  let placed = 0;
  let attempts = 0;
  while (placed < 6000 && attempts < 40000) {
    attempts += 1;
    const x = FIELDS.minX + 30 + rand() * (FIELDS.maxX - FIELDS.minX - 60);
    const z = FIELDS.minZ + 30 + rand() * (TUNNEL.toZ - FIELDS.minZ - 34);
    if (fbm(x * 0.025 + 3, z * 0.025) < 0.5 || Math.abs(z - riverZ(x)) < 12 || Math.abs(x - pathX(z)) < 2.5) continue;
    m4.compose(new THREE.Vector3(x, h(x, z) + 0.18, z), q.identity(), new THREE.Vector3(1, 0.6 + rand(), 1));
    flowers.setMatrixAt(placed++, m4);
  }
  flowers.count = placed;
  group.add(flowers);

  // The humans' conduit: from the tunnel mouth along the path to the Gates, pulsing slowly.
  const conduitMat = toon({ color: '#6fd8d0', emissive: '#2fb8b0', emissiveIntensity: 0.9, rim: false });
  const conduitPoints: THREE.Vector3[] = [new THREE.Vector3(-0.4, 0.4, -30), new THREE.Vector3(-0.6, 0.4, TUNNEL.toZ)];
  for (let z = TUNNEL.toZ - 10; z > GATES.z + 20; z -= 10) {
    const x = pathX(z) + 2.2;
    conduitPoints.push(new THREE.Vector3(x, h(x, z) + 0.35, z));
  }
  conduitPoints.push(new THREE.Vector3(POWER_PYLON.x + 1.5, 0.6, POWER_PYLON.z + 3));
  const conduit = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(conduitPoints), 400, 0.2, 8, false), conduitMat);
  group.add(conduit);

  // The Gates: two colossal pillars and a lintel of black stone and bone.
  const obsidian = toon({ color: '#211a2c' });
  for (const pillar of GATE_PILLARS) {
    group.add(M(new THREE.CylinderGeometry(2.6, 3.4, 30, 8), obsidian, [pillar.x, 15, pillar.z], { outline: 0.05 }));
    group.add(M(new THREE.ConeGeometry(3.2, 5, 8), bone, [pillar.x, 32.5, pillar.z], { outline: 0.04 }));
  }
  group.add(M(new THREE.BoxGeometry(42, 3.4, 5), obsidian, [GATES.x, 28, GATE_PILLARS[0].z], { outline: 0.05 }));
  // A beacon above the Gates so they read from anywhere in the fields (no fog, steady).
  const beaconMat = new THREE.MeshBasicMaterial({ color: '#5ff0e0', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 7, 160, 16, 1, true), beaconMat);
  beacon.position.set(BEACON.x, 80, BEACON.z);
  group.add(beacon);

  // (Cerberus Mk. II is an entity since M7: content/mechs/cerberus-mk2.)
  const iron = toon({ color: '#3d3f4a' });

  // The real Cerberus, chained by the Gates: a pale spectral hound (three heads), drained, lying down.
  const spiritMat = toon({ color: '#9fe8ff', emissive: '#3fa8d8', emissiveIntensity: 0.7, rim: false, transparent: true, opacity: 0.85 });
  const hound = new THREE.Group();
  const houndHome = new THREE.Vector3(CERBERUS_HOUND.x, 0, CERBERUS_HOUND.z);
  hound.position.copy(houndHome);
  hound.rotation.y = CERBERUS_HOUND.yaw;
  // Body, four legs (folded under him while he's chained), a tail, three necks and heads.
  const houndBody = new THREE.Group();
  hound.add(houndBody);
  houndBody.add(M(new THREE.CapsuleGeometry(1.35, 3.6, 4, 12), spiritMat, [0, 2.3, 0], { rot: [Math.PI / 2, 0, 0], outline: 0.03 }));
  const houndLegs = [[-0.8, 1.6], [0.8, 1.6], [-0.8, -1.7], [0.8, -1.7]].map(([x, z]) => {
    const leg = new THREE.Group();
    leg.position.set(x, 1.8, z);
    leg.add(M(new THREE.CapsuleGeometry(0.38, 1.3, 3, 8), spiritMat, [0, -0.9, 0], { outline: 0.02 }));
    leg.add(M(new THREE.SphereGeometry(0.45, 8, 6), spiritMat, [0, -1.75, 0.2], { scale: [1, 0.55, 1.3], outline: 0.015 }));
    houndBody.add(leg);
    return leg;
  });
  const tail = M(new THREE.ConeGeometry(0.35, 2.6, 8), spiritMat, [0, 2.9, -3.4], { rot: [-2.2, 0, 0], outline: 0.02 });
  houndBody.add(tail);
  const houndEyeMat = toon({ color: '#ffffff', emissive: '#bff8ff', emissiveIntensity: 1.2, rim: false });
  const houndHeads = new THREE.Group();
  houndHeads.position.set(0, 3, 2.4);
  for (const [x, ry] of [[-1, 0.3], [0, 0], [1, -0.3]] as const) {
    const head = new THREE.Group();
    // Necks splay outward so the three heads read apart.
    head.position.set(x * 1.3, 0, 0);
    head.rotation.set(0, ry, -x * 0.42);
    head.add(M(new THREE.CylinderGeometry(0.42, 0.55, 1.6, 8), spiritMat, [0, 0.4, 0.5], { rot: [0.9, 0, 0], outline: 0.015 }));
    head.add(M(new THREE.SphereGeometry(0.72, 12, 10), spiritMat, [0, 1, 1.2], { scale: [1, 0.9, 1.1], outline: 0.02 }));
    head.add(M(new THREE.BoxGeometry(0.62, 0.5, 0.95), spiritMat, [0, 0.82, 1.95], { outline: 0.015 }));
    for (const side of [-1, 1]) {
      head.add(M(new THREE.ConeGeometry(0.2, 0.6, 6), spiritMat, [side * 0.38, 1.7, 1.05], { rot: [-0.2, 0, side * -0.25], outline: 0.012 }));
      head.add(M(new THREE.SphereGeometry(0.1, 8, 6), houndEyeMat, [side * 0.26, 1.12, 1.82], { outline: false }));
    }
    houndHeads.add(head);
  }
  houndBody.add(houndHeads);
  group.add(hound);
  const chainMat = toon({ color: '#5c5f6b' });
  group.add(M(new THREE.CylinderGeometry(0.7, 0.9, 6, 8), iron, [CERBERUS_POST.x, 3, CERBERUS_POST.z], { outline: 0.03 }));
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CERBERUS_POST.x, 4.5, CERBERUS_POST.z),
    new THREE.Vector3(CERBERUS_POST.x + 2.5, 2.2, CERBERUS_POST.z + 1.5),
    new THREE.Vector3(CERBERUS_POST.x + 5, 2.6, CERBERUS_POST.z + 3.5),
  ]);
  const chain = new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 20, 0.14, 6, false), chainMat);
  group.add(chain);

  // The power pylon: gathers the hound's drained fire and beams it to the Mk. II's back.
  const pylonTop = new THREE.Vector3(POWER_PYLON.x, 11, POWER_PYLON.z);
  group.add(M(new THREE.CylinderGeometry(0.9, 1.6, 10, 6), iron, [POWER_PYLON.x, 5, POWER_PYLON.z], { outline: 0.03 }));
  const pylonGemMat = toon({ color: '#9ff6ec', emissive: '#2fb8b0', emissiveIntensity: 1.1, rim: false });
  const pylonGem = M(new THREE.OctahedronGeometry(1.3, 0), pylonGemMat, [pylonTop.x, pylonTop.y, pylonTop.z], { outline: 0.02 });
  group.add(pylonGem);
  // The drain: pulsing conduits from the hound to the pylon.
  const drain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(CERBERUS_HOUND.x, 2.5, CERBERUS_HOUND.z),
    new THREE.Vector3((CERBERUS_HOUND.x + POWER_PYLON.x) / 2, 5, (CERBERUS_HOUND.z + POWER_PYLON.z) / 2),
    new THREE.Vector3(POWER_PYLON.x, 9.5, POWER_PYLON.z),
  ]), 40, 0.3, 8, false), conduitMat);
  group.add(drain);
  // The beam to the mech: a thin glowing rod re-aimed every frame.
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7ff6ea', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beamGeo = new THREE.CylinderGeometry(0.22, 0.22, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  group.add(beam);
  // Poseidon's spout (M7 story): a column of sea-water that rises on the plaza for his arrival.
  const springAt = freedPoints().spring;
  const springMat = new THREE.MeshBasicMaterial({ color: '#7fe9f0', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const springGeo = new THREE.CylinderGeometry(1.4, 2.4, 9, 20, 1, true);
  springGeo.translate(0, 4.5, 0);
  const spring = new THREE.Mesh(springGeo, springMat);
  spring.position.set(springAt.x - GROTTO.center.x, springAt.y - GROTTO.center.y, springAt.z - GROTTO.center.z);
  spring.visible = false;
  group.add(spring);
  const beamTo = new THREE.Vector3();
  const beamUp = new THREE.Vector3(0, 1, 0);

  // The humans' forts: a log palisade with a gate toward the path, a watchtower, tents, a campfire and a banner.
  const logMat = toon({ color: '#5e4330' });
  const canvas = toon({ color: '#c9b99a' });
  const banner = toon({ color: '#9b2b2b', side: THREE.DoubleSide, rim: false });
  const flame = new THREE.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false });
  const logGeo = new THREE.CylinderGeometry(0.22, 0.25, 3.6, 7);
  const tipGeo = new THREE.ConeGeometry(0.22, 0.45, 7);
  const logs: THREE.Matrix4[] = [];
  const tips: THREE.Matrix4[] = [];
  for (const fort of FORT_SPOTS) {
    for (const seg of palisadeSegments(fort)) {
      for (let k = -4; k <= 4; k += 1) {
        const x = seg.x + Math.cos(seg.yaw) * k * 0.46;
        const z = seg.z - Math.sin(seg.yaw) * k * 0.46;
        const y = h(x, z);
        const tall = 3.2 + ((k * 7 + Math.round(seg.x)) % 3) * 0.2;
        logs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + tall / 2, z), q.identity(), new THREE.Vector3(1, tall / 3.6, 1)));
        tips.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + tall + 0.2, z), q.identity(), new THREE.Vector3(1, 1, 1)));
      }
    }
    const tower = watchtowerSpot(fort);
    const ty = h(tower.x, tower.z);
    for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      group.add(M(new THREE.CylinderGeometry(0.18, 0.2, 7.5, 7), logMat, [tower.x + ox, ty + 3.75, tower.z + oz], { outline: 0.012 }));
    }
    group.add(M(new THREE.BoxGeometry(3.6, 0.3, 3.6), logMat, [tower.x, ty + 7.5, tower.z], { outline: 0.015 }));
    group.add(M(new THREE.ConeGeometry(2.8, 1.8, 4), logMat, [tower.x, ty + 9.6, tower.z], { rot: [0, Math.PI / 4, 0], outline: 0.015 }));
    group.add(M(new THREE.PlaneGeometry(1.2, 2), banner, [tower.x, ty + 6.4, tower.z + 1.85], { outline: false }));
    for (const [ox, oz, r] of [[-6, 4, 0.4], [5, 5, -0.6]]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.4, 4), canvas);
      tent.position.set(fort.x + ox, h(fort.x + ox, fort.z + oz) + 1.2, fort.z + oz);
      tent.rotation.y = r;
      tent.castShadow = true;
      group.add(tent);
    }
    const fy = h(fort.x + 2, fort.z + 1);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      group.add(M(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), logMat, [fort.x + 2 + Math.cos(a) * 0.3, fy + 0.15, fort.z + 1 + Math.sin(a) * 0.3], { rot: [Math.PI / 2, a, 0], outline: false }));
    }
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), flame);
    fire.position.set(fort.x + 2, fy + 0.5, fort.z + 1);
    group.add(fire);
  }
  const logMesh = new THREE.InstancedMesh(logGeo, logMat, logs.length);
  logs.forEach((m, i) => logMesh.setMatrixAt(i, m));
  logMesh.castShadow = true;
  group.add(logMesh);
  const tipMesh = new THREE.InstancedMesh(tipGeo, logMat, tips.length);
  tips.forEach((m, i) => tipMesh.setMatrixAt(i, m));
  group.add(tipMesh);

  // Soul-motes drifting around the camera.
  const moteCount = 500;
  const motePositions = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i += 1) motePositions.set([(rand() - 0.5) * 120, rand() * 30, (rand() - 0.5) * 120], i * 3);
  const motesGeo = new THREE.BufferGeometry();
  motesGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({ color: '#9ff6ec', size: 0.35, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const motes = new THREE.Points(motesGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  let active = false;
  return {
    group,
    setActive(on) {
      active = on;
      group.visible = on;
    },
    setGates({ mech, freedT, freed }) {
      // The beam reaches the mech's back while it's powered (and until the conduits burst in the scene).
      const conduitsBurst = freed || (freedT !== null && freedT >= 2.5);
      beam.visible = !!mech && !conduitsBurst;
      if (mech && beam.visible) {
        const back = { x: -Math.sin(mech.yaw), z: -Math.cos(mech.yaw) };
        beamTo.set(mech.x - group.position.x + back.x * (MECH_SIZE.halfZ - 1), mech.y - group.position.y + 17, mech.z - group.position.z + back.z * (MECH_SIZE.halfZ - 1));
        const dir = beamTo.clone().sub(pylonTop);
        beam.position.copy(pylonTop);
        beam.scale.set(1, dir.length(), 1);
        beam.quaternion.setFromUnitVectors(beamUp, dir.normalize());
      }
      drain.visible = !conduitsBurst;
      pylonGemMat.emissiveIntensity = conduitsBurst ? 0.1 : 1.1;
      const sec = (beat: keyof typeof FREED_BEATS) => FREED_BEATS[beat] / 30;
      chain.visible = !(freed || (freedT !== null && freedT >= sec('chains')));
      const ramp = (from: number, length: number) => (freedT === null ? 0 : Math.min(1, Math.max(0, (freedT - from) / length)));
      // The hound: drained and lying while chained; in the scene he rises, howls, then lowers his heads to Hades.
      // Once freed he stays, standing, at the Gates.
      hound.visible = true;
      const rise = freed ? 1 : ramp(sec('rise'), 2);
      const howl = freed ? 0 : ramp(sec('howl'), 0.8) * (1 - ramp(sec('howl') + 1.6, 0.8));
      const nuzzle = freed ? 0 : ramp(sec('nuzzle'), 0.8) * (1 - ramp(sec('bond') + 0.5, 1));
      hound.position.set(houndHome.x, 0, houndHome.z);
      hound.scale.setScalar(1 + rise * 0.3);
      houndBody.position.y = -1.25 * (1 - rise);
      for (const leg of houndLegs) leg.rotation.x = (leg.position.z > 0 ? -1.3 : 1.3) * (1 - rise);
      tail.rotation.x = -2.2 + rise * 0.6;
      houndHeads.rotation.x = 0.35 * (1 - rise) - howl * 0.55 + nuzzle * 0.5;
      houndEyeMat.emissiveIntensity = 0.5 + rise * 1.2;
      // His fire flows into the gods at the bond: a brief, gentle swell of his glow (no flash).
      const bond = freed ? 0 : ramp(sec('bond'), 1) * (1 - ramp(sec('bond') + 1.5, 1.5));
      spiritMat.emissiveIntensity = 0.7 + rise * 1.1 + bond * 0.8;
      spiritMat.opacity = 0.85;
      // Poseidon's spout: a column of water rises, holds while he steps out, and sinks back.
      const spout = ramp(sec('poseidon'), 1.2) * (1 - ramp(sec('poseidonOut') + 0.8, 1.2));
      spring.visible = spout > 0.01;
      spring.scale.set(1, Math.max(0.01, spout), 1);
    },
    update(time, camera, reduceMotion) {
      if (!active) return;
      const speed = reduceMotion ? 0.8 : 2;
      conduitMat.emissiveIntensity = 0.9 + Math.sin(time * speed) * 0.25;
      beamMat.opacity = 0.6 + Math.sin(time * speed * 1.5) * 0.15;
      // Keep the motes around the camera (they wrap as it moves) and let them drift.
      motes.position.set(
        Math.round((camera.position.x - group.position.x) / 120) * 120,
        camera.position.y - group.position.y - 10,
        Math.round((camera.position.z - group.position.z) / 120) * 120,
      );
      motes.rotation.y = reduceMotion ? 0 : time * 0.01;
    },
  };
}
