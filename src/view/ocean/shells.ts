import * as THREE from 'three';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Look } from '../look';

/**
 * The sea's kit of shapes (team request, Nov 16: "color the whole thing with
 * sea shells and other things that represent the ocean"): scallops, conches,
 * starfish, sand dollars, giant clams, kelp and branching coral. Each builder
 * returns a geometry in its own frame; `ShellBatch` merges many placed copies
 * per material into one mesh, so hundreds of shells cost a few draw calls.
 */

/** A scallop fan standing in the XY plane (hinge at the origin, opening up +y, ridged face toward +z). */
export function scallopGeometry(r: number, ribs = 9): THREE.BufferGeometry {
  const spread = 1.25;
  const g = new ParametricGeometry((u, v, target) => {
    const theta = (u * 2 - 1) * spread;
    const rho = 0.08 + v * 0.92;
    const ridge = Math.abs(Math.cos(theta * ribs * 0.5 * Math.PI / spread)) * 0.11 * rho;
    const dome = 0.28 * Math.sin(Math.PI * Math.min(1, v * 1.05)) * (1 - Math.abs(u * 2 - 1) * 0.5);
    // A wavy rim, scalloped at each rib.
    const rim = 1 + 0.06 * Math.cos(theta * ribs * Math.PI / spread) * v * v;
    target.set(Math.sin(theta) * rho * r * rim, Math.cos(theta) * rho * r * rim, (ridge + dome) * r);
  }, ribs * 4, 8);
  // The hinge's two little "ears".
  const ears = new THREE.BoxGeometry(r * 0.7, r * 0.2, r * 0.12);
  ears.translate(0, r * 0.08, r * 0.04);
  return merge([g, ears]);
}

/** A conch: a spiral cone standing up +y from the origin, `h` tall and `r` wide at its widest whorl. */
export function conchGeometry(r: number, h: number, turns = 3.2): THREE.BufferGeometry {
  return new ParametricGeometry((u, v, target) => {
    const t = v * turns * Math.PI * 2;
    const taper = 1 - v;
    const R = r * 0.55 * taper;
    const tube = r * 0.5 * taper + 0.02 * r;
    const knob = 1 + 0.18 * Math.max(0, Math.sin(t * 2.5)) * taper;
    const a = u * Math.PI * 2;
    const cx = Math.cos(t) * R;
    const cz = Math.sin(t) * R;
    const along = Math.cos(a) * tube * knob;
    target.set(cx + Math.cos(t) * along, v * h + Math.sin(a) * tube * 0.8, cz + Math.sin(t) * along);
  }, 10, Math.round(turns * 18));
}

/** A five-armed starfish lying in the XY plane (facing +z), `r` to each arm's tip. */
export function starfishGeometry(r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.38;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: r * 0.12, bevelEnabled: true, bevelThickness: r * 0.08, bevelSize: r * 0.08, bevelSegments: 1 });
}

/** A sand dollar: a thin disc lying flat (XZ plane). */
export function sandDollarGeometry(r: number): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(r, r, r * 0.12, 14);
}

/**
 * A giant clam lying on its back (hinge toward −z), both valves wavy at the
 * rim, its top valve propped open. The pearl is separate (see `pearlAt`).
 */
export function clamGeometry(r: number, open = 0.7): THREE.BufferGeometry {
  const valve = (flip: number) => {
    const g = new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const wave = 1 + 0.09 * Math.cos(Math.atan2(z, x) * 7);
      p.setXYZ(i, x * wave, p.getY(i) * 0.42 * flip, z * wave);
    }
    g.computeVertexNormals();
    return g;
  };
  const bottom = valve(-1);
  bottom.translate(0, r * 0.05, 0);
  const top = valve(1);
  // Hinge at the back rim: rotate the top valve up about it.
  top.translate(0, 0, r);
  top.rotateX(-open);
  top.translate(0, r * 0.05, -r);
  return merge([bottom, top]);
}

/** A kelp ribbon rising +y, `h` tall, wavering side to side. */
export function kelpGeometry(h: number, width = 0.5, seed = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, h, 1, 12);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const y = p.getY(i) + h / 2;
    const k = y / h;
    p.setXYZ(i, p.getX(i) * (1 - k * 0.6) + Math.sin(y * 1.3 + seed) * 0.35 * k, y, Math.cos(y * 0.9 + seed) * 0.2 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Branching coral: a trunk splitting into upturned branches, `h` tall, rising +y. */
export function branchCoralGeometry(h: number, rand: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(h * 0.06, h * 0.1, h * 0.45, 6);
  trunk.translate(0, h * 0.22, 0);
  parts.push(trunk);
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i += 1) {
    const len = h * (0.35 + rand() * 0.3);
    const place = new THREE.Matrix4()
      .makeTranslation(0, h * (0.3 + rand() * 0.15), 0)
      .multiply(new THREE.Matrix4().makeRotationY((i / n) * Math.PI * 2 + rand()))
      .multiply(new THREE.Matrix4().makeRotationZ(0.35 + rand() * 0.5));
    const b = new THREE.CylinderGeometry(h * 0.035, h * 0.06, len, 5);
    b.translate(0, len / 2, 0);
    parts.push(b.applyMatrix4(place));
    const tip = new THREE.SphereGeometry(h * 0.05, 6, 4);
    tip.translate(0, len, 0);
    parts.push(tip.applyMatrix4(place));
  }
  return merge(parts);
}

/** Brain coral: a squashed, furrowed dome. */
export function brainCoralGeometry(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const furrow = 1 + 0.07 * Math.sin(x * 9 / r + Math.sin(z * 7 / r) * 2);
    p.setXYZ(i, x * furrow, y * 0.65 * furrow, z * furrow);
  }
  g.computeVertexNormals();
  return g;
}

/** Bring geometries to one layout (non-indexed, position/normal/uv, no groups) and merge them. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  return mergeGeometries(parts.map(normalize))!;
}

function normalize(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  out.clearGroups();
  return out;
}

/** Many placed copies, merged per material at `flush`. */
export class ShellBatch {
  private buckets = new Map<THREE.Material, { parts: THREE.BufferGeometry[]; outline: number | false; cast: boolean }>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  /** Place `geometry` (cloned) at `pos` with Euler `rot` (YXZ, so yaw applies last) and uniform `scale`. */
  add(geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale = 1, outline: number | false = 0.01, cast = true): void {
    let bucket = this.buckets.get(material);
    if (!bucket) {
      bucket = { parts: [], outline, cast };
      this.buckets.set(material, bucket);
    }
    this.e.set(rot[0], rot[1], rot[2], 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(...pos), this.q, this.s.setScalar(scale));
    bucket.parts.push(normalize(geometry.clone()).applyMatrix4(this.m));
  }

  flush(look: Look, group: THREE.Group): void {
    for (const [material, bucket] of this.buckets) {
      if (!bucket.parts.length) continue;
      group.add(look.M(mergeGeometries(bucket.parts)!, material, [0, 0, 0], { outline: bucket.outline, cast: bucket.cast }));
    }
    this.buckets.clear();
  }
}
