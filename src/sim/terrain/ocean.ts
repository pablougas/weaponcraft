import { fbm, smoothstep } from './noise';

/**
 * The Ocean (team request, Nov 15): Poseidon's sea, reached through his
 * sea-gate at the Gates once Cerberus is free. In metres relative to the
 * region's centre at sea level (x east, z south; the castle lies north, −z):
 *
 *   a sandy beach (where the sea-gate stands, a human ship wrecked on its
 *   west end) → a causeway → Atlantis's island castle, taken by the humans,
 *   with Poseidon's kraken chained in the water beside it.
 *
 * Everything is a pure function of position, so physics and the view build
 * the same ground. The water itself is never walkable: the edge keeps gods
 * on land.
 */
export const BEACH = { x: 0, z: 24, rx: 32, rz: 15 } as const;
export const CAUSEWAY = { halfWidth: 4.5, fromZ: 14, toZ: -40 } as const;
export const CASTLE = { x: 0, z: -64, radius: 28 } as const;
/** The castle's curtain wall (a ring with the gate south, toward the causeway) and its towers. */
export const CASTLE_WALL = { radius: 20, gateHalfAngle: 0.3, height: 7 } as const;
export const CASTLE_TOWERS: ReadonlyArray<{ x: number; z: number }> = [0.55, 1.6, 2.6, 3.7, 4.7, 5.75].map((a) => ({
  x: CASTLE.x + Math.sin(a) * CASTLE_WALL.radius,
  z: CASTLE.z + Math.cos(a) * CASTLE_WALL.radius,
}));
/** The domed keep in the middle of the courtyard. */
export const KEEP = { x: CASTLE.x, z: CASTLE.z - 6, radius: 6.5 } as const;
/** The wrecked human ship, run aground at the beach's west end (yaw like rotationY: its bow's heading). */
export const SHIPWRECK = { x: -21, z: 27, yaw: 0.55, halfLength: 10, halfBeam: 3 } as const;
/** Poseidon's kraken, chained in the sea east of the castle; the humans' rig drains it. */
export const KRAKEN = { x: 38, z: -66 } as const;
export const KRAKEN_RIG = { x: 13, z: -60 } as const;
/** The sea-gate on the beach (back to the Gates) and where travellers step out of it. */
export const SEA_GATE = { x: 7, z: 33 } as const;
export const OCEAN_ARRIVAL = { x: 7, z: 30.2, rotationY: Math.PI } as const;
/** Ground heights: the beach and causeway, and the castle's island a little higher. */
const BEACH_HEIGHT = 1.0;
const CASTLE_HEIGHT = 1.6;
const SEA_FLOOR = -4;

/** Signed distance to the land (negative on land), roughly in metres. */
export function landDistance(x: number, z: number): number {
  const beach = (Math.hypot((x - BEACH.x) / BEACH.rx, (z - BEACH.z) / BEACH.rz) - 1) * Math.min(BEACH.rx, BEACH.rz);
  const cx = Math.abs(x) - CAUSEWAY.halfWidth;
  const cz = Math.max(z - CAUSEWAY.fromZ, CAUSEWAY.toZ - z);
  const causeway = cx > 0 && cz > 0 ? Math.hypot(cx, cz) : Math.max(cx, cz);
  const island = Math.hypot(x - CASTLE.x, z - CASTLE.z) - CASTLE.radius;
  return Math.min(beach, causeway, island);
}

/** Ground height relative to sea level. */
export function oceanLocalHeight(x: number, z: number): number {
  const toCastle = smoothstep(-28, -40, z);
  const dunes = (fbm(x * 0.08 + 7, z * 0.08 - 3) - 0.5) * 0.8 * smoothstep(10, 18, z);
  const land = BEACH_HEIGHT + (CASTLE_HEIGHT - BEACH_HEIGHT) * toCastle + dunes;
  return land + (SEA_FLOOR - land) * smoothstep(-1.5, 6, landDistance(x, z));
}

/** Is (x, z) somewhere a god can stand, `margin` metres in from the water's edge? */
export function oceanInside(x: number, z: number, margin = 0): boolean {
  return landDistance(x, z) < -1 - margin;
}

/** The nearest standable point to (x, z). */
export function oceanClamp(x: number, z: number, margin = 0): { x: number; z: number } {
  if (oceanInside(x, z, margin)) return { x, z };
  const m = margin + 1.05;
  const candidates: Array<{ x: number; z: number }> = [];
  // The beach (pulled in along the ray from its centre), the causeway (a box) and the island (a circle).
  const ex = (x - BEACH.x) / BEACH.rx;
  const ez = (z - BEACH.z) / BEACH.rz;
  const e = Math.hypot(ex, ez) || 1;
  const shrink = 1 - m / Math.min(BEACH.rx, BEACH.rz);
  candidates.push({ x: BEACH.x + (ex / e) * shrink * BEACH.rx, z: BEACH.z + (ez / e) * shrink * BEACH.rz });
  const hw = CAUSEWAY.halfWidth - m;
  candidates.push({ x: Math.max(-hw, Math.min(hw, x)), z: Math.max(CAUSEWAY.toZ, Math.min(CAUSEWAY.fromZ, z)) });
  const dx = x - CASTLE.x;
  const dz = z - CASTLE.z;
  const d = Math.hypot(dx, dz) || 1;
  const r = Math.min(d, CASTLE.radius - m);
  candidates.push({ x: CASTLE.x + (dx / d) * r, z: CASTLE.z + (dz / d) * r });
  const inside = candidates.filter((c) => oceanInside(c.x, c.z, margin - 0.05));
  const pool = inside.length > 0 ? inside : candidates;
  pool.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  return pool[0];
}

/** The ground grid shared by the physics heightfield and the drawn sand. */
export const OCEAN_GRID = { minX: -70, maxX: 70, minZ: -104, maxZ: 52, cell: 2 } as const;

/** Curtain-wall segments (centres and yaw), leaving the gate open to the south. */
export function castleWallSegments(): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const count = 30;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < CASTLE_WALL.gateHalfAngle) continue;
    out.push({ x: CASTLE.x + Math.sin(a) * CASTLE_WALL.radius, z: CASTLE.z + Math.cos(a) * CASTLE_WALL.radius, yaw: a });
  }
  return out;
}
