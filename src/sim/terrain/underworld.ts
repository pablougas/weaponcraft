import { fbm, ridged, smoothstep } from './noise';

/**
 * The Underworld route's shape (SPEC §3.5, M6), in metres relative to the
 * Outer Grotto's centre (x east, z south; the route runs north, toward −z):
 *
 *   grotto (r 20) → tunnel (8 m wide, z −19…−60) → the Asphodel Fields
 *   (520 × 560 m, z −60…−620) → the Gates at the far end.
 *
 * Heights are relative to the grotto floor. Everything is a pure function of
 * position, so physics and the view build the same ground.
 */
export const TUNNEL = { halfWidth: 4, fromZ: -17, toZ: -60 } as const;
export const FIELDS = { minX: -260, maxX: 260, minZ: -620, maxZ: -60 } as const;
/** Grid used for both the collider and the mesh. */
export const FIELDS_CELL = 2.5;

/** The main path's centre line x at a given z (the conduit runs along it). */
export function pathX(z: number): number {
  const d = Math.max(0, -60 - z);
  return Math.sin(d * 0.011) * 38 * smoothstep(0, 60, d) * (1 - smoothstep(470, 530, d));
}

/** The Styx: a winding river crossing the fields from west to east, twice. */
export function riverZ(x: number): number {
  return -260 + Math.sin(x * 0.012 + 0.6) * 70 + Math.sin(x * 0.031) * 14;
}

/** The Gates (where Cerberus Mk. II stands, M7) and the three human forts on the way (M6). */
export const GATES = { x: 0, z: -585 } as const;
export const FORT_SPOTS = [
  { id: 'fort-asphodel', x: pathX(-185) - 34, z: -185 },
  { id: 'fort-styx', x: pathX(-345) + 38, z: -345 },
  { id: 'fort-gates', x: pathX(-480) - 30, z: -480 },
] as const;
export const FORT_RADIUS = 16;

/** Ground height relative to the grotto floor. */
export function underworldLocalHeight(x: number, z: number): number {
  if (z > TUNNEL.toZ) return 0;
  const d = TUNNEL.toZ - z; // metres past the tunnel mouth
  const open = smoothstep(0, 45, d);
  let h = (fbm(x * 0.011 + 40, z * 0.011) - 0.5) * 9 + (ridged(x * 0.02, z * 0.02) - 0.5) * 2;
  // Cliffs at the edge of the fields.
  const edge = Math.min(x - FIELDS.minX, FIELDS.maxX - x, z - FIELDS.minZ);
  h += (1 - smoothstep(0, 32, edge)) * 26;
  // The river channel.
  const river = Math.abs(z - riverZ(x));
  h -= (1 - smoothstep(5, 14, river)) * 3.2;
  // Flatten the main path a little, the forts and the Gates' plaza fully.
  const path = Math.abs(x - pathX(z));
  h *= 1 - (1 - smoothstep(4, 14, path)) * 0.6;
  for (const fort of FORT_SPOTS) {
    const r = Math.hypot(x - fort.x, z - fort.z);
    h *= smoothstep(FORT_RADIUS, FORT_RADIUS + 12, r);
  }
  h *= smoothstep(55, 85, Math.hypot(x - GATES.x, z - GATES.z));
  return h * open;
}

/** Is (x, z) (relative to the grotto) somewhere a god can stand, `margin` metres in from the edge? */
export function underworldInside(x: number, z: number, margin = 0, barricadeOpen = true): boolean {
  if (Math.hypot(x, z) < 20 - margin) return true;
  if (barricadeOpen && Math.abs(x) < TUNNEL.halfWidth - margin && z <= TUNNEL.fromZ && z >= TUNNEL.toZ - 2) return true;
  return x > FIELDS.minX + 24 + margin && x < FIELDS.maxX - 24 - margin && z < FIELDS.maxZ - margin && z > FIELDS.minZ + 24 + margin;
}

/** The nearest standable point to (x, z), relative to the grotto. */
export function underworldClamp(x: number, z: number, margin = 0): { x: number; z: number } {
  if (underworldInside(x, z, margin)) return { x, z };
  const candidates: Array<{ x: number; z: number }> = [];
  const r = Math.hypot(x, z) || 1;
  candidates.push({ x: (x / r) * (20 - margin - 0.01), z: (z / r) * (20 - margin - 0.01) });
  candidates.push({ x: Math.max(-(TUNNEL.halfWidth - margin - 0.01), Math.min(TUNNEL.halfWidth - margin - 0.01, x)), z: Math.min(TUNNEL.fromZ, Math.max(TUNNEL.toZ - 1.9, z)) });
  candidates.push({
    x: Math.max(FIELDS.minX + 24 + margin + 0.01, Math.min(FIELDS.maxX - 24 - margin - 0.01, x)),
    z: Math.max(FIELDS.minZ + 24 + margin + 0.01, Math.min(FIELDS.maxZ - margin - 0.01, z)),
  });
  candidates.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  return candidates[0];
}

/** Gate pillars, the Mk. II's footprint and Cerberus's chain post (the M7 set piece, inactive in M6). */
export const GATE_PILLARS = [{ x: GATES.x - 17, z: GATES.z - 12 }, { x: GATES.x + 17, z: GATES.z - 12 }] as const;
export const MECH_FOOTPRINT = { x: GATES.x, z: GATES.z - 4, halfX: 5.5, halfZ: 9 } as const;
export const CERBERUS_POST = { x: GATES.x - 22, z: GATES.z + 4 } as const;

export interface Spire {
  x: number;
  z: number;
  radius: number;
  height: number;
}

/** Bone-white rock spires across the fields (same list for collision and drawing). */
export const SPIRES: readonly Spire[] = (() => {
  // Deterministic layout from a fixed seed (content, not world state).
  let s = 0x5f1e5 >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Spire[] = [];
  let tries = 0;
  while (out.length < 70 && tries < 4000) {
    tries += 1;
    const x = FIELDS.minX + 30 + next() * (FIELDS.maxX - FIELDS.minX - 60);
    const z = FIELDS.minZ + 30 + next() * (FIELDS.maxZ - FIELDS.minZ - 70);
    if (Math.abs(x - pathX(z)) < 14 || Math.abs(z - riverZ(x)) < 16) continue;
    if (FORT_SPOTS.some((f) => Math.hypot(x - f.x, z - f.z) < FORT_RADIUS + 14)) continue;
    if (Math.hypot(x - GATES.x, z - GATES.z) < 75) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 14)) continue;
    out.push({ x, z, radius: 1.4 + next() * 2.2, height: 6 + next() * 16 });
  }
  return out;
})();

/** Bearing (like rotationY) from a fort's centre to its gate, which faces the main path. */
export function fortGateBearing(fort: { x: number; z: number }): number {
  return Math.atan2(pathX(fort.z) - fort.x, 0.0001);
}

/** Palisade wall segments around a fort (centres and yaw), leaving the gate open. */
export function palisadeSegments(fort: { x: number; z: number }): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const gate = fortGateBearing(fort);
  const count = 26;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - gate), Math.cos(a - gate))) < 0.3) continue;
    out.push({ x: fort.x + Math.sin(a) * FORT_RADIUS, z: fort.z + Math.cos(a) * FORT_RADIUS, yaw: a });
  }
  return out;
}

/** The watchtower inside each fort, opposite the gate. */
export function watchtowerSpot(fort: { x: number; z: number }): { x: number; z: number } {
  const a = fortGateBearing(fort) + Math.PI;
  return { x: fort.x + Math.sin(a) * (FORT_RADIUS - 4), z: fort.z + Math.cos(a) * (FORT_RADIUS - 4) };
}
