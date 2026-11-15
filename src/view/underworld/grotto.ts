import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROTTO_SPOTS } from '../../sim/cutscenes/descent';
import { GROTTO } from '../../sim/regions';
import { rng } from '../../sim/rng';
import { fbm } from '../../sim/terrain/noise';
import type { Look } from '../look';
import { createParticles } from '../particles';

export interface GrottoView {
  group: THREE.Group;
  /** Point lights (kept in the scene always; dimmed to 0 on the surface to avoid shader recompiles). */
  setActive(active: boolean): void;
  update(time: number, reduceMotion: boolean): void;
}

/**
 * The Outer Grotto (SPEC §3.3, M5.1): the first safe chamber of the
 * Underworld and the new Refuge, in its fixed "eternal dusk" palette.
 * Everything here is scenery; the altar, bed, Hades, the dispatch and the
 * barricade are sim entities (the last two are drawn here as part of the room).
 */
export function buildGrotto(look: Look): GrottoView {
  const { M, toon } = look;
  const group = new THREE.Group();
  group.position.set(GROTTO.center.x, GROTTO.center.y, GROTTO.center.z);
  const random = rng(0, 'grotto', 5151);
  const rand = () => random.next();

  // Floor: dark stone with mossy, violet-tinted patches.
  const floorGeo = new THREE.CircleGeometry(27, 64, 0, Math.PI * 2);
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position;
  const floorColors = new Float32Array(fp.count * 3);
  const c = new THREE.Color();
  const stoneA = new THREE.Color('#3b3452');
  const stoneB = new THREE.Color('#57497a');
  const moss = new THREE.Color('#2f5e5a');
  for (let i = 0; i < fp.count; i += 1) {
    const x = fp.getX(i);
    const z = fp.getZ(i);
    c.copy(stoneA).lerp(stoneB, fbm(x * 0.12 + 3, z * 0.12)).lerp(moss, Math.max(0, fbm(x * 0.08, z * 0.08 + 9) - 0.45) * 1.6);
    floorColors.set([c.r, c.g, c.b], i * 3);
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(floorColors, 3));
  const floor = new THREE.Mesh(floorGeo, toon({ vertexColors: true, grad: look.GRAD4, rim: false }));
  floor.receiveShadow = true;
  group.add(floor);

  // Walls: a jagged ring, pushed out into an alcove where the tunnel leads north.
  const wallGeo = new THREE.CylinderGeometry(23, 25, 17, 72, 10, true);
  const wp = wallGeo.attributes.position;
  const wallColors = new Float32Array(wp.count * 3);
  const rockA = new THREE.Color('#3a2f52');
  const rockB = new THREE.Color('#5f4c86');
  for (let i = 0; i < wp.count; i += 1) {
    const x = wp.getX(i);
    const y = wp.getY(i);
    const z = wp.getZ(i);
    const a = Math.atan2(x, z);
    const n = fbm(Math.cos(a) * 3 + 7, y * 0.18 + Math.sin(a) * 3);
    let push = (n - 0.5) * 5;
    const fromTunnel = Math.abs(Math.atan2(Math.sin(a - GROTTO.tunnelBearing), Math.cos(a - GROTTO.tunnelBearing)));
    if (fromTunnel < 0.2 && y < 1.5) push += 9 * (1 - fromTunnel / 0.2);
    const r = Math.hypot(x, z) + push;
    wp.setXYZ(i, Math.sin(a) * r, y + 8.5, Math.cos(a) * r);
    c.copy(rockA).lerp(rockB, n);
    wallColors.set([c.r, c.g, c.b], i * 3);
  }
  wallGeo.setAttribute('color', new THREE.BufferAttribute(wallColors, 3));
  wallGeo.computeVertexNormals();
  const walls = new THREE.Mesh(wallGeo, toon({ vertexColors: true, grad: look.GRAD4, rim: false, side: THREE.BackSide }));
  walls.receiveShadow = true;
  group.add(walls);

  // Ceiling dome and stalactites.
  const domeGeo = new THREE.SphereGeometry(25, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  domeGeo.scale(1, 0.55, 1);
  domeGeo.translate(0, 16.5, 0);
  group.add(new THREE.Mesh(domeGeo, toon({ color: '#2d2440', rim: false, side: THREE.BackSide })));
  const stalMat = toon({ color: '#3a3247', rim: false });
  for (let i = 0; i < 26; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 4 + rand() * 18;
    const h = 1.2 + rand() * 3.2;
    group.add(M(new THREE.ConeGeometry(0.25 + rand() * 0.45, h, 6), stalMat, [Math.cos(a) * r, 17.5 - h / 2 - (r / 23) * 4, Math.sin(a) * r], { rot: [Math.PI, 0, 0], outline: false, cast: false }));
  }

  // A crystal cavern: clusters of six-sided crystals grow out of the walls,
  // stand along the floor's edge and hang from the ceiling (teal, violet, pale).
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
    toon({ color: '#7fe0d6', emissive: '#2fb8aa', emissiveIntensity: 0.75, rim: false }),
    toon({ color: '#b89ae8', emissive: '#6a44c0', emissiveIntensity: 0.75, rim: false }),
    toon({ color: '#e4dcff', emissive: '#8f7fd0', emissiveIntensity: 0.55, rim: false }),
  ];
  for (const mat of crystalMats) look.glowMaterials.push({ mat, day: mat.emissiveIntensity, night: mat.emissiveIntensity });
  type Crystal = { pos: THREE.Vector3; dir: THREE.Vector3; width: number; height: number };
  const crystals: Crystal[][] = [[], [], []];
  const fromTunnel = (a: number) => Math.abs(Math.atan2(Math.sin(a - GROTTO.tunnelBearing), Math.cos(a - GROTTO.tunnelBearing)));
  const up = new THREE.Vector3(0, 1, 0);
  const addCluster = (base: THREE.Vector3, along: THREE.Vector3, count: number, size: number, spread: number) => {
    const kind = Math.floor(rand() * 3);
    for (let k = 0; k < count; k += 1) {
      const dir = along.clone().add(new THREE.Vector3((rand() - 0.5) * spread, (rand() - 0.5) * spread, (rand() - 0.5) * spread)).normalize();
      const s = size * (0.45 + rand() * 0.75);
      crystals[(kind + (k % 4 === 3 ? 1 : 0)) % 3].push({ pos: base.clone().add(new THREE.Vector3((rand() - 0.5) * size * 0.5, 0, (rand() - 0.5) * size * 0.5)), dir, width: s * 0.38, height: s });
    }
  };
  // Walls: clusters at every height, pointing into the cavern.
  for (let i = 0; i < 90; i += 1) {
    const a = rand() * Math.PI * 2;
    if (fromTunnel(a) < 0.32) continue;
    const y = Math.pow(rand(), 1.4) * 11;
    const r = 22.2 - y * 0.12;
    const inward = new THREE.Vector3(-Math.sin(a), 0.35 + rand() * 0.5, -Math.cos(a));
    addCluster(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r), inward, 3 + Math.floor(rand() * 4), 0.9 + rand() * 1.6, 0.9);
  }
  // Floor edge: big standing crystals leaning in.
  for (let i = 0; i < 26; i += 1) {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    if (fromTunnel(a) < 0.4) continue;
    const r = 20.3 + rand() * 1.2;
    addCluster(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r), new THREE.Vector3(-Math.sin(a) * 0.45, 1, -Math.cos(a) * 0.45), 2 + Math.floor(rand() * 3), 2.4 + rand() * 2.6, 0.6);
  }
  // Ceiling: crystals hanging down.
  for (let i = 0; i < 34; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 3 + rand() * 17;
    const y = 16.5 - (r / 23) * 4.5;
    addCluster(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Vector3(0, -1, 0), 2 + Math.floor(rand() * 3), 1 + rand() * 1.8, 0.7);
  }
  const quat = new THREE.Quaternion();
  const mtx = new THREE.Matrix4();
  crystals.forEach((list, k) => {
    const mesh = new THREE.InstancedMesh(crystalGeo, crystalMats[k], list.length);
    list.forEach((c, i) => {
      quat.setFromUnitVectors(up, c.dir);
      mtx.compose(c.pos, quat, new THREE.Vector3(c.width, c.height, c.width));
      mesh.setMatrixAt(i, mtx);
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // The Styx pool, west of the rig: dark water with a soft teal glow and a stone rim.
  const pool = new THREE.Group();
  pool.position.set(-8.5, 0, -8);
  pool.add(M(new THREE.TorusGeometry(2.6, 0.35, 6, 28), toon({ color: '#3c3446' }), [0, 0.12, 0], { rot: [Math.PI / 2, 0, 0], outline: 0.02 }));
  const waterMat = toon({ color: '#0d2a33', emissive: '#1f8f8f', emissiveIntensity: 0.6, rim: false });
  pool.add(M(new THREE.CircleGeometry(2.55, 32), waterMat, [0, 0.06, 0], { rot: [-Math.PI / 2, 0, 0], outline: false, cast: false }));
  group.add(pool);

  // The humans' conduit rig: a brass machine pumping a glowing line down the tunnel.
  const brass = toon({ color: '#a8863a' });
  const ironMat = toon({ color: '#3d3f4a' });
  const conduitMat = toon({ color: '#6fd8d0', emissive: '#2fb8b0', emissiveIntensity: 0.9, rim: false });
  const rig = new THREE.Group();
  const rs = GROTTO_SPOTS.rig;
  rig.position.set(rs.x, 0, rs.z);
  rig.add(M(new THREE.BoxGeometry(3.2, 0.5, 2.2), ironMat, [0, 0.25, 0], { outline: 0.02 }));
  rig.add(M(new THREE.BoxGeometry(2.2, 1.6, 1.4), brass, [-0.3, 1.3, 0], { outline: 0.02 }));
  for (const x of [-1.1, 0.5]) {
    rig.add(M(new THREE.CylinderGeometry(0.42, 0.42, 1.9, 12), ironMat, [x, 2.6, 0], { outline: 0.015 }));
    for (let k = 0; k < 3; k += 1) rig.add(M(new THREE.TorusGeometry(0.47, 0.06, 6, 16), conduitMat, [x, 2.0 + k * 0.5, 0], { rot: [Math.PI / 2, 0, 0], outline: false, cast: false }));
  }
  rig.add(M(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 8), ironMat, [1.3, 1.6, 0.4], { rot: [0, 0, 0.4], outline: 0.01 }));
  group.add(rig);
  const conduitPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(rs.x - 0.6, 0.35, rs.z - 1.1),
    new THREE.Vector3(3.5, 0.25, -12.5),
    new THREE.Vector3(0.8, 0.3, -16.5),
    new THREE.Vector3(0, 0.45, -21),
    new THREE.Vector3(-0.4, 0.6, -30),
  ]);
  const conduit = new THREE.Mesh(new THREE.TubeGeometry(conduitPath, 80, 0.16, 8, false), conduitMat);
  group.add(conduit);

  // The crate with the dispatch, a dropped helmet and a lantern.
  const ds = GROTTO_SPOTS.dispatch;
  const crate = new THREE.Group();
  crate.position.set(ds.x, 0, ds.z);
  crate.rotation.y = 0.3;
  const woodMat = toon({ color: '#6a4a33' });
  crate.add(M(new THREE.BoxGeometry(0.9, 0.7, 0.7), woodMat, [0, 0.35, 0], { outline: 0.015 }));
  crate.add(M(new THREE.BoxGeometry(0.42, 0.015, 0.3), toon({ color: '#efe6cf', rim: false }), [0.05, 0.71, 0.02], { rot: [0, 0.4, 0], outline: 0.006 }));
  crate.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), toon({ color: '#8c2f2f', rim: false }), [-0.18, 0.74, -0.05], { rot: [0, 0, Math.PI / 2], outline: false }));
  crate.add(M(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), ironMat, [0.65, 0, 0.25], { outline: 0.01 }));
  group.add(crate);

  // Torches the humans left: steady flames (no flicker).
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false });
  const addTorch = (x: number, z: number) => {
    group.add(M(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), woodMat, [x, 0.8, z], { outline: 0.008 }));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 8), flameMat);
    flame.position.set(x, 1.75, z);
    group.add(flame);
  };
  addTorch(ds.x + 1.6, ds.z - 0.8);
  addTorch(-4.2, GROTTO_SPOTS.barricade.z + 1.6);
  addTorch(4.2, GROTTO_SPOTS.barricade.z + 1.6);

  // The barricade across the tunnel: sharpened logs, iron bands and a red banner.
  const bs = GROTTO_SPOTS.barricade;
  const barricade = new THREE.Group();
  barricade.position.set(bs.x, 0, bs.z);
  for (let i = 0; i < 23; i += 1) {
    const x = -6.6 + i * 0.6;
    const h = 3.6 + rand() * 0.8;
    barricade.add(M(new THREE.CylinderGeometry(0.25, 0.27, h, 7), woodMat, [x, h / 2, (rand() - 0.5) * 0.15], { outline: 0.012 }));
    barricade.add(M(new THREE.ConeGeometry(0.25, 0.55, 7), woodMat, [x, h + 0.27, 0], { outline: 0.01 }));
  }
  for (const y of [1.1, 2.6]) barricade.add(M(new THREE.BoxGeometry(14, 0.14, 0.62), ironMat, [0, y, 0.05], { outline: 0.01 }));
  barricade.add(M(new THREE.PlaneGeometry(1.4, 2.2), toon({ color: '#9b2b2b', rim: false, side: THREE.DoubleSide }), [1.6, 2.2, 0.32], { outline: false }));
  group.add(barricade);

  // Grey asphodel flowers and drifting soul-motes.
  const asphodel = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.32, 5), toon({ color: '#cfcad6', emissive: '#6d6380', emissiveIntensity: 0.3, rim: false }), 260);
  const m4 = new THREE.Matrix4();
  let placed = 0;
  while (placed < 260) {
    const a = rand() * Math.PI * 2;
    const r = 3 + Math.sqrt(rand()) * 17;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.hypot(x - rs.x, z - rs.z) < 2.5 || Math.hypot(x + 8.5, z + 8) < 3.2 || z < -16) continue;
    m4.compose(new THREE.Vector3(x, 0.16, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.6 + rand(), 1));
    asphodel.setMatrixAt(placed, m4);
    placed += 1;
  }
  group.add(asphodel);
  const motes = createParticles(look.U, rand, 260, () => [(rand() - 0.5) * 38, 0.5 + rand() * 12, (rand() - 0.5) * 38], {
    size: 0.4, colA: '#7ff6e8', colB: '#c9a8ff', additive: true, gain: 3, drift: 1.2,
  });
  motes.material.uniforms.opacity.value = 0.8;
  group.add(motes);

  const lights = [
    new THREE.PointLight('#4ff0e0', 0, 16, 1.6),
    new THREE.PointLight('#ffb35c', 0, 12, 1.8),
    new THREE.PointLight('#3fc8d0', 0, 10, 1.8),
  ];
  lights[0].position.set(rs.x, 2.6, rs.z);
  lights[1].position.set(bs.x, 2.2, bs.z + 2);
  lights[2].position.set(-8.5, 1.2, -8);
  for (const light of lights) group.add(light);
  const baseIntensity = [1.6, 2, 1.4];
  let active = false;

  return {
    group,
    setActive(on) {
      active = on;
      group.visible = on;
      lights.forEach((light, i) => {
        light.intensity = on ? baseIntensity[i] : 0;
      });
    },
    update(time, reduceMotion) {
      if (!active) return;
      // A slow, gentle pulse along the conduit (never a flash).
      const speed = reduceMotion ? 0.8 : 2.2;
      const amount = reduceMotion ? 0.25 : 0.6;
      conduitMat.emissiveIntensity = 0.9 + Math.sin(time * speed) * amount * 0.4;
      lights[0].intensity = baseIntensity[0] + Math.sin(time * speed) * amount * 0.5;
      waterMat.emissiveIntensity = 0.55 + Math.sin(time * 0.7) * 0.1;
    },
  };
}
