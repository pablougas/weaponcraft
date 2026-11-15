import * as THREE from 'three';
import { rng } from '../../sim/rng';
import { ridged, smoothstep as smooth } from '../../sim/terrain/noise';
import type { Look } from '../look';

/** Mountain-local height of the summit plateau (the temple stands at 960). */
const SUMMIT_Y = 960;
/** Where the shattered top is cut off (fraction of the cone's height). */
const CUT_T = 0.8;
/** Seconds the collapse takes after impact (debris flying out, dust rolling down). */
const COLLAPSE_SECONDS = 4.5;

export interface OlympusState {
  /** Has the rocket hit? */
  shattered: boolean;
  /** Seconds since impact during the cinematic (drives the collapse), or null outside it. */
  sinceImpact: number | null;
  /** Seconds since the rocket launched (0 at launch), or null if it isn't flying. */
  rocketFlight: number | null;
  /** Seconds since the pan to the human columns began, or null if they're hidden. */
  columns: number | null;
  /** Smoke rises from the summit (the first in-game day after the blast). */
  smoke: boolean;
  /** View clock, for idle motion. */
  time: number;
  reduceMotion: boolean;
}

export interface OlympusView {
  group: THREE.Group;
  /** World-space summit and mid-slope points, for camera framing. */
  summitWorld(out: THREE.Vector3): THREE.Vector3;
  baseWorld(out: THREE.Vector3): THREE.Vector3;
  /** World position of the flying rocket (only meaningful while it flies). */
  rocketWorld(out: THREE.Vector3): THREE.Vector3;
  update(state: OlympusState): void;
}

function buildMountainGeometry(shattered: boolean): THREE.ConeGeometry {
  const geometry = new THREE.ConeGeometry(360, 980, 64, 40, true);
  const p = geometry.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  const rockC = new THREE.Color('#9a93a0');
  const snowC = new THREE.Color('#f5f7fc');
  const marble = new THREE.Color('#e9e3d6');
  const scorched = new THREE.Color('#4a4048');
  for (let i = 0; i < p.count; i += 1) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = (y + 490) / 980;
    const n = ridged(Math.cos(a) * 2 + 10, t * 6);
    const rr = 1 + (n - 0.5) * 0.35 * (1 - t);
    x *= rr;
    z *= rr;
    y += (n - 0.5) * 40;
    c.copy(rockC).lerp(snowC, smooth(0.45, 0.7, t + (n - 0.5) * 0.2)).lerp(marble, smooth(0.9, 1.0, t));
    if (shattered && t > CUT_T - 0.05) {
      // Blown off: everything above the cut collapses onto a jagged, scorched crater rim.
      const rim = (CUT_T - 0.5) * 980 + Math.sin(a * 7) * 18 + Math.sin(a * 13 + 1.3) * 10 + (n - 0.5) * 30;
      if (y > rim) {
        const inward = Math.min(1, (t - CUT_T) / (1 - CUT_T));
        y = rim - inward * 40;
        x *= 1 + inward * 0.6;
        z *= 1 + inward * 0.6;
      }
      c.lerp(scorched, smooth(CUT_T - 0.08, CUT_T, t) * 0.8);
    }
    p.setXYZ(i, x, y, z);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface Debris {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  spin: THREE.Vector3;
  phase: number;
}

/**
 * Mount Olympus on the horizon: intact, with the golden temple and floating
 * marble islands, or shattered (SPEC §3.3): the top torn off, the temple in
 * floating pieces. Also hosts the rocket cinematic's distant effects, which
 * live in the mountain's own coordinates: the rocket and its smoke trail,
 * the shockwave, the dust wall, the smoke column and the human columns
 * climbing from each biome.
 */
export function buildOlympus(look: Look): OlympusView {
  const group = new THREE.Group();
  const toonMountain = (shattered: boolean) => new THREE.Mesh(
    buildMountainGeometry(shattered),
    look.farFog(look.toon({ vertexColors: true, grad: look.GRAD4, rim: false })),
  );
  const mountain = toonMountain(false);
  mountain.position.y = 490 - 30;
  group.add(mountain);
  const shatteredMountain = toonMountain(true);
  shatteredMountain.position.y = 490 - 30;
  shatteredMountain.visible = false;
  group.add(shatteredMountain);

  const gold = look.farFog(look.toon({ color: '#ffd36b', emissive: '#ffb340', emissiveIntensity: 1.4, rim: false }));
  look.glowMaterials.push({ mat: gold, day: 1.4, night: 3.0 });
  const temple = new THREE.Group();
  temple.add(new THREE.Mesh(new THREE.BoxGeometry(70, 10, 46), gold));
  for (let i = 0; i < 8; i += 1) {
    for (const zz of [-18, 18]) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 8), gold);
      column.position.set(-30 + i * 8.6, 18, zz);
      temple.add(column);
    }
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(48, 16, 4), gold);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.6);
  roof.position.y = 39;
  temple.add(roof);
  temple.position.y = SUMMIT_Y;
  group.add(temple);

  const islandMaterial = look.farFog(look.toon({ color: '#e7e1d3', grad: look.GRAD4, rim: false }));
  for (let i = 0; i < 6; i += 1) {
    const island = new THREE.Mesh(new THREE.ConeGeometry(28 + i * 4, 60, 7), islandMaterial);
    island.rotation.x = Math.PI;
    const a = (i / 6) * Math.PI * 2;
    island.position.set(Math.cos(a) * (260 + i * 25), 760 + (i % 3) * 70, Math.sin(a) * 160);
    group.add(island);
    const top = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 10), gold);
    top.position.copy(island.position).y += 33;
    group.add(top);
  }

  // Debris: rock and temple fragments that fly out at impact and then float (seeded, always the same).
  const random = rng(0, 'olympus-debris', 7071);
  const rockMat = look.farFog(look.toon({ color: '#8f8794', grad: look.GRAD4, rim: false }));
  const debrisGroup = new THREE.Group();
  debrisGroup.visible = false;
  group.add(debrisGroup);
  const debris: Debris[] = [];
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const columnGeo = new THREE.CylinderGeometry(2.6, 2.6, 22, 8);
  const slabGeo = new THREE.BoxGeometry(26, 8, 18);
  for (let i = 0; i < 42; i += 1) {
    const kind = i < 26 ? 'rock' : i < 36 ? 'column' : 'slab';
    const mesh = new THREE.Mesh(kind === 'rock' ? rockGeo : kind === 'column' ? columnGeo : slabGeo, kind === 'rock' ? rockMat : gold);
    if (kind === 'rock') mesh.scale.setScalar(10 + random.next() * 26);
    const a = random.next() * Math.PI * 2;
    const from = new THREE.Vector3(Math.cos(a) * random.next() * 50, SUMMIT_Y - 40 + random.next() * 50, Math.sin(a) * random.next() * 50);
    const r = 140 + random.next() * 200;
    const to = new THREE.Vector3(Math.cos(a) * r, 760 + random.next() * 320, Math.sin(a) * r * 0.75);
    mesh.position.copy(from);
    debrisGroup.add(mesh);
    debris.push({ mesh, from, to, spin: new THREE.Vector3(random.next() - 0.5, random.next() - 0.5, random.next() - 0.5), phase: random.next() * 6.28 });
  }

  // Shockwave: an expanding, fading ring at the summit.
  const shockMat = new THREE.MeshBasicMaterial({ color: '#fff1c9', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shock = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 64), shockMat);
  shock.rotation.x = Math.PI / 2;
  shock.position.y = SUMMIT_Y - 60;
  group.add(shock);

  // Dust wall and smoke: soft billboards.
  const puffMaterial = (color: string) => new THREE.PointsMaterial({ color, size: 120, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, map: softDot(), fog: false });
  const dustCount = 220;
  const dustBase = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const a = (i / dustCount) * Math.PI * 2 + random.next() * 0.05;
    dustBase.set([Math.cos(a), random.next(), Math.sin(a)], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dustCount * 3), 3));
  const dustMat = puffMaterial('#cbb79a');
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  const smokeCount = 120;
  const smokeSeeds = Array.from({ length: smokeCount }, () => [random.next(), random.next(), random.next()]);
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(smokeCount * 3), 3));
  const smokeMat = puffMaterial('#5d5560');
  smokeMat.size = 230;
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  smoke.frustumCulled = false;
  group.add(smoke);

  // The rocket: launched from the far west, arcing onto the summit.
  const rocket = new THREE.Group();
  const hull = look.toon({ color: '#d9dde6', rim: false });
  const fins = look.toon({ color: '#8c2f2f', rim: false });
  rocket.add(new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 34, 10), hull));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 10), hull);
  nose.position.y = 24;
  rocket.add(nose);
  for (let i = 0; i < 4; i += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 10, 8), fins);
    fin.position.set(Math.cos((i * Math.PI) / 2) * 5, -14, Math.sin((i * Math.PI) / 2) * 5);
    fin.rotation.y = -(i * Math.PI) / 2;
    rocket.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(6, 26, 10), new THREE.MeshBasicMaterial({ color: '#ffd38a', toneMapped: false, fog: false }));
  flame.position.y = -30;
  flame.rotation.x = Math.PI;
  rocket.add(flame);
  rocket.scale.setScalar(1.6);
  rocket.visible = false;
  group.add(rocket);
  const trailCount = 320;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailCount * 3), 3));
  const trailMat = new THREE.PointsMaterial({ color: '#e8e4dc', size: 55, transparent: true, opacity: 0.75, depthWrite: false, map: softDot(), fog: false });
  const trail = new THREE.Points(trailGeo, trailMat);
  trail.frustumCulled = false;
  trail.visible = false;
  group.add(trail);
  // Far enough west to enter from the edge of the wide shot, close enough to stay in frame.
  const launch = new THREE.Vector3(-1150, 260, 650);
  const summit = new THREE.Vector3(0, SUMMIT_Y + 10, 0);
  const rocketAt = (u: number, out: THREE.Vector3) => {
    // A rising arc: ease-in along the line, plus a lift that peaks mid-flight.
    out.lerpVectors(launch, summit, u * u * (1.6 - 0.6 * u));
    out.y += Math.sin(Math.PI * u) * 380;
    return out;
  };

  // Human columns: one per biome, climbing from six sides with torches, banners and a mech each.
  const columns = new THREE.Group();
  columns.visible = false;
  group.add(columns);
  const marchers = 22;
  const soldierMat = look.farFog(look.toon({ color: '#2b2a33', rim: false }));
  // Torches ignore the haze so they glow from 2 km away.
  const torchMat = new THREE.MeshBasicMaterial({ color: '#ffb35c', toneMapped: false, fog: false });
  const bannerMat = look.farFog(look.toon({ color: '#9b2b2b', rim: false, side: THREE.DoubleSide }));
  const mechMat = look.farFog(look.toon({ color: '#1d1c22', rim: false }));
  // Exaggerated in size: they're seen from 2 km away and must read as figures with torches.
  const soldiers = new THREE.InstancedMesh(new THREE.CapsuleGeometry(3.4, 9, 3, 6), soldierMat, marchers * 6);
  const torches = new THREE.InstancedMesh(new THREE.SphereGeometry(3.4, 6, 4), torchMat, marchers * 6);
  columns.add(soldiers, torches);
  const columnPaths: Array<{ a: number; banners: THREE.Group[]; mech: THREE.Group }> = [];
  for (let c = 0; c < 6; c += 1) {
    const a = (c / 6) * Math.PI * 2 + 0.4;
    const banners: THREE.Group[] = [];
    for (let b = 0; b < 3; b += 1) {
      const banner = new THREE.Group();
      banner.add(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 34, 5), soldierMat));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), bannerMat);
      cloth.position.set(8, 11, 0);
      banner.add(cloth);
      columns.add(banner);
      banners.push(banner);
    }
    // A mech silhouette among them: a hulking four-legged machine.
    const mech = new THREE.Group();
    mech.scale.setScalar(1.6);
    mech.add(new THREE.Mesh(new THREE.BoxGeometry(34, 16, 14), mechMat));
    const head = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 10), mechMat);
    head.position.set(21, 6, 0);
    mech.add(head);
    for (const [lx, lz] of [[-12, -6], [-12, 6], [12, -6], [12, 6]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 4), mechMat);
      leg.position.set(lx, -14, lz);
      mech.add(leg);
    }
    columns.add(mech);
    columnPaths.push({ a, banners, mech });
  }
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  /**
   * A point on column `a`'s climbing path at progress u, on the cone's surface.
   * It starts above the meadow's own mountain ring, which hides Olympus's foot from the Refuge.
   */
  const pathPoint = (a: number, u: number, out: THREE.Vector3) => {
    const y = 330 + u * 360;
    const r = 360 * (1 - (y + 30) / 980) + 14;
    out.set(Math.cos(a) * r, y, Math.sin(a) * r);
    return out;
  };

  const tmp = new THREE.Vector3();
  const view: OlympusView = {
    group,
    summitWorld(out) {
      return group.localToWorld(out.set(0, SUMMIT_Y - 40, 0));
    },
    baseWorld(out) {
      return group.localToWorld(out.set(0, 470, 0));
    },
    rocketWorld(out) {
      return rocket.getWorldPosition(out);
    },
    update(state) {
      const { shattered, sinceImpact, time } = state;
      mountain.visible = !shattered;
      shatteredMountain.visible = shattered;
      temple.visible = !shattered;

      // Debris: fly out during the collapse, then hang and drift.
      debrisGroup.visible = shattered;
      if (shattered) {
        const p = sinceImpact === null ? 1 : Math.min(1, sinceImpact / COLLAPSE_SECONDS);
        const e = 1 - (1 - p) ** 3;
        const drift = state.reduceMotion ? 0.3 : 1;
        for (const d of debris) {
          d.mesh.position.lerpVectors(d.from, d.to, e);
          d.mesh.position.y += Math.sin(time * 0.3 + d.phase) * 6 * drift;
          d.mesh.rotation.set(d.spin.x * (time * 0.2 * drift + e * 4), d.spin.y * (time * 0.2 * drift + e * 4), d.spin.z * e * 4);
        }
      }

      // Shockwave and dust wall right after impact.
      const s = sinceImpact ?? Infinity;
      const shockP = Math.min(1, s / 2.2);
      shock.visible = s < 2.2;
      shock.scale.setScalar(60 + shockP * 900);
      shockMat.opacity = shock.visible ? (1 - shockP) * (state.reduceMotion ? 0.35 : 0.7) : 0;
      const dustP = Math.min(1, s / 6);
      dust.visible = s < 7;
      if (dust.visible) {
        const positions = dustGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < dustCount; i += 1) {
          const radius = 120 + dustP * 520 + dustBase[i * 3 + 1] * 40;
          const y = SUMMIT_Y - 80 - dustP * 860 + dustBase[i * 3 + 1] * 60;
          positions.setXYZ(i, dustBase[i * 3] * radius, y, dustBase[i * 3 + 2] * radius);
        }
        positions.needsUpdate = true;
        dustMat.opacity = Math.sin(Math.min(1, s / 6) * Math.PI) * 0.75;
      }

      // Smoke column through the first in-game day.
      smoke.visible = state.smoke && shattered && (sinceImpact === null || sinceImpact > 3);
      if (smoke.visible) {
        const positions = smokeGeo.attributes.position as THREE.BufferAttribute;
        smokeSeeds.forEach(([a, b, c], i) => {
          const rise = ((time * 0.04 + a) % 1);
          positions.setXYZ(i, (b - 0.5) * 60 + rise * 120, SUMMIT_Y - 80 + rise * 700, (c - 0.5) * 60 + rise * 40);
        });
        positions.needsUpdate = true;
        // Fades in once the collapse has settled.
        smokeMat.opacity = 0.32 * Math.min(1, Math.max(0, ((sinceImpact ?? 99) - 3) / 3));
      }

      // The rocket and its trail.
      const flight = state.rocketFlight;
      const flying = flight !== null && flight >= 0 && flight < 4.5;
      rocket.visible = flying;
      trail.visible = flight !== null && flight >= 0 && flight < 7;
      if (flight !== null && flight >= 0) {
        const u = Math.min(1, flight / 4.5);
        rocketAt(u, rocket.position);
        rocketAt(Math.min(1, u + 0.01), tmp);
        rocket.lookAt(group.localToWorld(tmp.clone()));
        rocket.rotateX(Math.PI / 2);
        const positions = trailGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < trailCount; i += 1) {
          rocketAt((i / trailCount) * u, tmp);
          positions.setXYZ(i, tmp.x, tmp.y, tmp.z);
        }
        positions.needsUpdate = true;
        trailMat.opacity = flight < 4.5 ? 0.75 : Math.max(0, 0.75 * (1 - (flight - 4.5) / 2.5));
      }

      // Columns climb steadily while shown.
      columns.visible = state.columns !== null;
      if (state.columns !== null) {
        const march = state.columns * 0.035;
        let k = 0;
        for (const path of columnPaths) {
          for (let i = 0; i < marchers; i += 1) {
            const u = Math.max(0, Math.min(1, 0.05 + march + i * 0.022));
            pathPoint(path.a, u, v);
            v.x += Math.sin(i * 1.7) * 6;
            m4.makeTranslation(v.x, v.y + 8, v.z);
            soldiers.setMatrixAt(k, m4);
            m4.makeTranslation(v.x + 3, v.y + 17, v.z);
            torches.setMatrixAt(k, m4);
            k += 1;
          }
          path.banners.forEach((banner, b) => {
            pathPoint(path.a, Math.min(1, 0.05 + march + (b * 7 + 3) * 0.022), banner.position);
            banner.position.y += 11;
          });
          pathPoint(path.a, Math.max(0, 0.05 + march - 0.04), path.mech.position);
          path.mech.position.y += 22;
          path.mech.rotation.y = -path.a + Math.PI;
        }
        soldiers.instanceMatrix.needsUpdate = true;
        torches.instanceMatrix.needsUpdate = true;
      }
    },
  };
  group.scale.setScalar(0.72);
  group.position.set(700, -40, -2050);
  group.updateMatrixWorld(true);
  return view;
}

let dotTexture: THREE.Texture | undefined;
/** A soft round sprite for dust and smoke (drawn once). */
function softDot(): THREE.Texture {
  if (dotTexture) return dotTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  dotTexture = new THREE.CanvasTexture(canvas);
  return dotTexture;
}
