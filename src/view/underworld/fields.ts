import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROTTO } from '../../sim/regions';
import { fbm } from '../../sim/terrain/noise';
import {
  CERBERUS_POST, FIELDS, FIELDS_CELL, GATE_PILLARS, GATES, MECH_FOOTPRINT, SPIRES, TUNNEL,
  pathX, riverZ, underworldLocalHeight,
} from '../../sim/terrain/underworld';
import type { Look } from '../look';

export interface FieldsView {
  group: THREE.Group;
  setActive(active: boolean): void;
  update(time: number, camera: THREE.Camera, reduceMotion: boolean): void;
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
  const c = new THREE.Color();
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const y = h(x, z);
    gp.setY(i, y);
    c.copy(ash).lerp(meadow, fbm(x * 0.03, z * 0.03 + 5)).lerp(moss, Math.max(0, fbm(x * 0.02 + 9, z * 0.02) - 0.55) * 2);
    if (y > 4) c.lerp(cliff, Math.min(1, (y - 4) / 12));
    if (Math.abs(z - riverZ(x)) < 14) c.lerp(bank, 0.6);
    if (Math.abs(x - pathX(z)) < 3 && z < TUNNEL.toZ) c.lerp(new THREE.Color('#6a5f78'), 0.5);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
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
    const base = h(spire.x, spire.z) - 1;
    q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.12, rand() * 6, (rand() - 0.5) * 0.12));
    m4.compose(new THREE.Vector3(spire.x, base, spire.z), q, new THREE.Vector3(spire.radius, spire.height, spire.radius));
    spires.setMatrixAt(k++, m4);
    // A smaller companion spire beside it.
    const a = rand() * Math.PI * 2;
    const sx = spire.x + Math.cos(a) * spire.radius * 1.6;
    const sz = spire.z + Math.sin(a) * spire.radius * 1.6;
    m4.compose(new THREE.Vector3(sx, h(sx, sz) - 0.5, sz), q, new THREE.Vector3(spire.radius * 0.5, spire.height * 0.45, spire.radius * 0.5));
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
  conduitPoints.push(new THREE.Vector3(MECH_FOOTPRINT.x + 3, 0.6, MECH_FOOTPRINT.z + MECH_FOOTPRINT.halfZ));
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
  beacon.position.set(MECH_FOOTPRINT.x, 80, MECH_FOOTPRINT.z);
  group.add(beacon);

  // Cerberus Mk. II (inactive until M7): a three-headed brass-and-iron war machine.
  const mech = new THREE.Group();
  mech.position.set(MECH_FOOTPRINT.x, 0, MECH_FOOTPRINT.z);
  const brass = toon({ color: '#a8863a' });
  const iron = toon({ color: '#3d3f4a' });
  const eye = toon({ color: '#ffb35c', emissive: '#ff7a1a', emissiveIntensity: 0.6, rim: false });
  mech.add(M(new THREE.BoxGeometry(8, 5, 15), iron, [0, 8.5, 0], { outline: 0.06 }));
  mech.add(M(new THREE.BoxGeometry(7, 2.2, 12), brass, [0, 11.6, 0.5], { outline: 0.05 }));
  for (const [x, z] of [[-3.5, 5.5], [3.5, 5.5], [-3.5, -5.5], [3.5, -5.5]]) {
    mech.add(M(new THREE.BoxGeometry(1.8, 6.5, 2), iron, [x, 3.3, z], { outline: 0.04 }));
    mech.add(M(new THREE.BoxGeometry(2.4, 1, 3), brass, [x, 0.5, z + 0.4], { outline: 0.03 }));
  }
  for (const [i, x] of [[0, -3], [1, 0], [2, 3]] as const) {
    const neck = new THREE.Group();
    neck.position.set(x, 10.5, 7.5);
    neck.rotation.y = (i - 1) * 0.35;
    neck.add(M(new THREE.CylinderGeometry(0.9, 1.2, 4, 8), iron, [0, 1.6, 0.8], { rot: [0.6, 0, 0], outline: 0.03 }));
    neck.add(M(new THREE.BoxGeometry(2.4, 2, 3.4), brass, [0, 3.6, 2.4], { outline: 0.04 }));
    neck.add(M(new THREE.BoxGeometry(2, 0.7, 2), iron, [0, 2.6, 3.4], { outline: 0.03 }));
    for (const ex of [-0.6, 0.6]) neck.add(M(new THREE.SphereGeometry(0.25, 8, 6), eye, [ex, 4, 4.05], { outline: false }));
    mech.add(neck);
  }
  mech.rotation.y = 0;
  group.add(mech);

  // The real Cerberus, chained beside it: a pale spectral hound (three heads), drained, lying down.
  const spiritMat = toon({ color: '#9fe8ff', emissive: '#3fa8d8', emissiveIntensity: 0.7, rim: false, transparent: true, opacity: 0.85 });
  const hound = new THREE.Group();
  hound.position.set(CERBERUS_POST.x + 5, 0, CERBERUS_POST.z + 2);
  hound.rotation.y = -0.9;
  hound.add(M(new THREE.CapsuleGeometry(1.4, 4, 4, 10), spiritMat, [0, 1.5, 0], { rot: [Math.PI / 2, 0, 0], outline: 0.03 }));
  for (const [x, ry] of [[-1, 0.5], [0, 0], [1, -0.5]] as const) {
    hound.add(M(new THREE.SphereGeometry(0.85, 12, 10), spiritMat, [x * 1.2, 2.1, 3.2], { rot: [0, ry, 0], scale: [1, 0.85, 1.3], outline: 0.02 }));
  }
  group.add(hound);
  const chainMat = toon({ color: '#5c5f6b' });
  group.add(M(new THREE.CylinderGeometry(0.7, 0.9, 6, 8), iron, [CERBERUS_POST.x, 3, CERBERUS_POST.z], { outline: 0.03 }));
  const chainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CERBERUS_POST.x, 4.5, CERBERUS_POST.z),
    new THREE.Vector3(CERBERUS_POST.x + 2.5, 2.2, CERBERUS_POST.z + 1.5),
    new THREE.Vector3(CERBERUS_POST.x + 5, 2.6, CERBERUS_POST.z + 3.5),
  ]);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(chainCurve, 20, 0.14, 6, false), chainMat));
  // Pulsing conduits from the hound to the mech.
  const drain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(CERBERUS_POST.x + 5, 2.5, CERBERUS_POST.z + 2),
    new THREE.Vector3(-10, 6, MECH_FOOTPRINT.z + 4),
    new THREE.Vector3(MECH_FOOTPRINT.x - 4, 9, MECH_FOOTPRINT.z),
  ]), 40, 0.3, 8, false), conduitMat);
  group.add(drain);

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
    update(time, camera, reduceMotion) {
      if (!active) return;
      const speed = reduceMotion ? 0.8 : 2;
      conduitMat.emissiveIntensity = 0.9 + Math.sin(time * speed) * 0.25;
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
