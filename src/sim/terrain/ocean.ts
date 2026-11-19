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
export const CAUSEWAY = { halfWidth: 6, fromZ: 14, toZ: -48 } as const;
/** Atlantis's island (team request, Nov 16: "a lot bigger"), a city-castle 140 m across. */
export const CASTLE = { x: 0, z: -112, radius: 70 } as const;
/** The castle's curtain wall (a ring with the gate south, toward the causeway) and its towers. */
export const CASTLE_WALL = { radius: 54, gateHalfAngle: 0.2, height: 14, segments: 56 } as const;
/** The wide opening in the back (north) of the curtain wall, out to the harbour (team request, Nov 16). */
export const BACK_GATE_HALF_ANGLE = 0.2;
/** Half the width of the gate's opening, in metres. */
export const CASTLE_GATE_HALF = (() => {
  const step = (Math.PI * 2) / CASTLE_WALL.segments;
  const first = Math.ceil(CASTLE_WALL.gateHalfAngle / step) * step;
  return Math.sin(first) * CASTLE_WALL.radius - wallSegmentLength() / 2;
})();
export const CASTLE_TOWERS: ReadonlyArray<{ x: number; z: number }> = [0.42, 1.1, 1.75, 2.4, 3.88, 4.53, 5.18, 5.86].map((a) => ({
  x: CASTLE.x + Math.sin(a) * CASTLE_WALL.radius,
  z: CASTLE.z + Math.cos(a) * CASTLE_WALL.radius,
}));
export const TOWER = { radius: 4.2, height: 24 } as const;
/** The great domed keep at the back of the courtyard. */
export const KEEP = { x: CASTLE.x, z: CASTLE.z - 18, radius: 15 } as const;
/**
 * The keep is a hollow hall (team request, Nov 16): its wall is a ring of
 * blocks with the door facing the gate (south) and a great opening at the back
 * (north) toward the harbour. Its colonnade stands clear of the door.
 */
export const KEEP_WALL = { thickness: 1.4, height: 22, segments: 44 } as const;
export const KEEP_DOOR = { halfWidth: 2.6, height: 7.2 } as const;
export const KEEP_BACK_OPENING_HALF = 7;
/**
 * The keep's stone base (Nov 16): a solid round step `top` metres high that is
 * also the hall's floor, with stairs up to the door and down from the back opening.
 */
export const KEEP_PLINTH = { radius: KEEP.radius + 3.2, top: 1.0 } as const;
export const KEEP_STEPS = { count: 3, run: 0.85 } as const;
/** Colonnade columns: none within this angle of the door, so it stays in view. */
const COLONNADE_CLEAR = 0.42;
export const COLUMN_RADIUS = 0.7;
/** Lesser shell-domed temples ringing the courtyard. */
export const TEMPLES: ReadonlyArray<{ x: number; z: number; radius: number }> = [
  { x: -30, z: CASTLE.z + 4, radius: 6 },
  { x: 30, z: CASTLE.z + 4, radius: 6 },
  { x: -26, z: CASTLE.z - 26, radius: 5.5 },
  { x: 26, z: CASTLE.z - 26, radius: 5.5 },
];
/** Poseidon's statue on its fountain, halfway up the avenue from the gate to the keep. */
export const STATUE = { x: CASTLE.x, z: CASTLE.z + 22, radius: 5 } as const;
/** The wrecked human ship, run aground at the beach's west end (yaw like rotationY: its bow's heading). */
export const SHIPWRECK = { x: -21, z: 27, yaw: 0.55, halfLength: 10, halfBeam: 3 } as const;
/** Poseidon's kraken, chained in the sea east of the castle (drawn 1.7x); the humans' rig drains it. */
export const KRAKEN = { x: 98, z: -96, scale: 1.7 } as const;
/** Gods can't come within this many metres of the chained kraken (team request, Nov 16). */
export const KRAKEN_KEEP_OUT = 44;
/**
 * The harbour behind Atlantis (team request, Nov 16): a round stone dock
 * through the back gate, across a short pier, where the humans' Kraken mech
 * stands guard.
 */
export const HARBOUR = { x: 0, z: -214, radius: 26 } as const;
export const PIER = { halfWidth: 8, fromZ: -176, toZ: -192 } as const;
/** Where the Kraken mech stands: the middle of the dock, facing the pier (south). */
export const KRAKEN_MECH_SPOT = { x: 0, z: -216, rotationY: 0 } as const;
/** The Kraken mech's drum (what gods can't walk through). */
export const KRAKEN_MECH_SIZE = { radius: 6, height: 7 } as const;
/**
 * The Atlantean village (team request, Nov 17): an island north of the
 * harbour, reached by an old stone bridge that rises out of the sea once the
 * Tide Engineer is beaten. Until then the bridge lies under the water.
 */
export const VILLAGE = { x: 0, z: -386, radius: 86 } as const;
/** The deck's top is a little above the land (1.6) at both ends, so the two surfaces never share a plane. */
export const BRIDGE = { halfWidth: 4, fromZ: -236, toZ: -302, deck: 1.8 } as const;
/** The plaza in the middle, and the paved ring roads between the rings of houses. */
export const VILLAGE_PLAZA = 16;
export const VILLAGE_RING_ROADS: readonly number[] = [40, 61];
/** A house: where it stands (angle round the village centre, ring radius), how big it is, and who lives there. */
export interface VillageHouseDef {
  id: string;
  angle: number;
  ring: number;
  radius: number;
  /** 'elder' | 'fisher' | 'smith' | 'healer' for the four with tasks; 'folk' for everyone else. */
  villager: string;
  name: string;
  /** Raiders are breaking in (the folk houses chosen for it, and all four task villagers' houses). */
  besieged: boolean;
}
const FOLK_NAMES = ['Doris', 'Leander', 'Thalia', 'Glaucus', 'Psamathe', 'Proteus', 'Galene', 'Nereus', 'Cymo', 'Triton', 'Speio', 'Halia', 'Eudora', 'Nausithoe', 'Pherusa', 'Actaea', 'Melite', 'Kymo', 'Erato', 'Iaera', 'Dynamene', 'Pontus', 'Amphitrite', 'Limnoreia', 'Agaue', 'Thoe', 'Eione', 'Ianira', 'Klymene', 'Oreithyia'];
/**
 * Every house (team request, Nov 17: "a lot lot lot lot bigger"): three rings
 * round the plaza — 8, 12 and 16 houses — set between the four main streets.
 * The four task villagers live on the inner ring (Elder Nerea's the biggest,
 * on the north side); ten more houses are besieged.
 */
export const VILLAGE_HOUSES: readonly VillageHouseDef[] = (() => {
  const rings = [{ ring: 30, n: 8, size: 4.6 }, { ring: 50, n: 12, size: 4.2 }, { ring: 70, n: 16, size: 3.9 }];
  const named: Record<string, { villager: string; name: string; radius: number }> = {
    '0-4': { villager: 'elder', name: 'Elder Nerea', radius: 5.4 },
    '0-2': { villager: 'fisher', name: 'Talo', radius: 4.6 },
    '0-6': { villager: 'smith', name: 'Kora', radius: 4.6 },
    '0-0': { villager: 'healer', name: 'Ione', radius: 4.6 },
  };
  const out: VillageHouseDef[] = [];
  let folk = 0;
  rings.forEach((r, ri) => {
    for (let k = 0; k < r.n; k += 1) {
      // Offset by half a step so no house stands in a main street (north, south, east, west).
      const angle = (Math.PI / r.n) + (k * Math.PI * 2) / r.n;
      const key = `${ri}-${k}`;
      const n = named[key];
      // A little variety in size (deterministic).
      const wobble = ((k * 7 + ri * 3) % 5) * 0.12 - 0.24;
      const besieged = !!n || (ri === 1 && k % 2 === 0) || (ri === 2 && k % 4 === 1);
      out.push({
        id: n ? `house-${n.villager}` : `house-${ri}-${k}`,
        angle,
        ring: r.ring,
        radius: n ? n.radius : r.size + wobble,
        villager: n ? n.villager : 'folk',
        name: n ? n.name : FOLK_NAMES[folk++ % FOLK_NAMES.length],
        besieged,
      });
    }
  });
  return out;
})();
/** A house's centre, its door (on its wall, facing the plaza), the step outside it, and the door's heading. */
export function villageHouse(h: { angle: number; radius: number; ring: number }): { x: number; z: number; door: { x: number; z: number }; step: { x: number; z: number }; doorYaw: number } {
  const x = VILLAGE.x + Math.sin(h.angle) * h.ring;
  const z = VILLAGE.z + Math.cos(h.angle) * h.ring;
  const doorYaw = h.angle + Math.PI;
  const at = (d: number) => ({ x: x + Math.sin(doorYaw) * d, z: z + Math.cos(doorYaw) * d });
  return { x, z, door: at(h.radius), step: at(h.radius + 1.8), doorYaw };
}
/** A house's wall height and the top of its shell-dome roof (the view draws them; physics keeps the camera out). */
export function villageHouseHeights(h: { radius: number; villager: string }): { wall: number; roofTop: number } {
  const wall = 3.2 + h.radius * 0.12 + (h.villager === 'elder' ? 0.8 : 0);
  return { wall, roofTop: wall - 0.1 + (h.radius + 0.6) * 0.75 };
}
/** The coral fountain in the middle of the plaza. */
export const VILLAGE_FOUNTAIN = { x: VILLAGE.x, z: VILLAGE.z, radius: 4.5 } as const;
/** Where the raiders' battering ram sits: just inside the village, by the bridge. */
export const VILLAGE_RAM = { x: VILLAGE.x + 6, z: VILLAGE.z + VILLAGE.radius - 12, rotationY: -0.4 } as const;
/** Where Ione's little brother Pip hides: behind the keep, in the castle's back courtyard. */
export const PIP_HIDEOUT = { x: -21, z: -152 } as const;
/** Talo's glow pearls, scattered by the raiders: round the village, at both ends of the bridge, and on the dock. */
export const GLOW_PEARLS: ReadonlyArray<{ x: number; z: number }> = [
  { x: -46, z: -352 }, { x: 58, z: -412 }, { x: 2, z: -446 }, { x: 4, z: -322 }, { x: -18, z: -230 },
];
export const KRAKEN_RIG = { x: 40, z: -96 } as const;
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
  const px = Math.abs(x - HARBOUR.x) - PIER.halfWidth;
  const pz = Math.max(z - PIER.fromZ, PIER.toZ - z);
  const pier = px > 0 && pz > 0 ? Math.hypot(px, pz) : Math.max(px, pz);
  const harbour = Math.hypot(x - HARBOUR.x, z - HARBOUR.z) - HARBOUR.radius;
  const village = Math.hypot(x - VILLAGE.x, z - VILLAGE.z) - VILLAGE.radius;
  return Math.min(beach, causeway, island, pier, harbour, village);
}

/** On the bridge's deck (the sea floor is far below; the deck is a collider, up once it has risen). */
export function onBridge(x: number, z: number, margin = 0): boolean {
  return Math.abs(x - VILLAGE.x) < BRIDGE.halfWidth - 0.6 - margin && z <= BRIDGE.fromZ && z >= BRIDGE.toZ;
}

/** Where things stand: the terrain, or the bridge's deck over the sea (the sim only lets anyone onto it once it has risen). */
export function oceanStandHeight(x: number, z: number): number {
  const ground = oceanLocalHeight(x, z);
  return Math.abs(x - VILLAGE.x) < BRIDGE.halfWidth && z <= BRIDGE.fromZ && z >= BRIDGE.toZ ? Math.max(ground, BRIDGE.deck) : ground;
}

/** Ground height relative to sea level. */
export function oceanLocalHeight(x: number, z: number): number {
  const toCastle = smoothstep(-34, -48, z);
  const dunes = (fbm(x * 0.08 + 7, z * 0.08 - 3) - 0.5) * 0.8 * smoothstep(10, 18, z);
  const land = BEACH_HEIGHT + (CASTLE_HEIGHT - BEACH_HEIGHT) * toCastle + dunes;
  return land + (SEA_FLOOR - land) * smoothstep(-1.5, 6, landDistance(x, z));
}

/** Is (x, z) somewhere a god can stand, `margin` metres in from the water's edge? */
export function oceanInside(x: number, z: number, margin = 0): boolean {
  return (landDistance(x, z) < -1 - margin && Math.hypot(x - KRAKEN.x, z - KRAKEN.z) > KRAKEN_KEEP_OUT + margin) || onBridge(x, z, margin);
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
  const pw = PIER.halfWidth - m;
  candidates.push({ x: HARBOUR.x + Math.max(-pw, Math.min(pw, x - HARBOUR.x)), z: Math.max(PIER.toZ, Math.min(PIER.fromZ, z)) });
  const hx = x - HARBOUR.x;
  const hz = z - HARBOUR.z;
  const hd = Math.hypot(hx, hz) || 1;
  const hr = Math.min(hd, HARBOUR.radius - m);
  candidates.push({ x: HARBOUR.x + (hx / hd) * hr, z: HARBOUR.z + (hz / hd) * hr });
  // Pushed back out of the kraken's reach: the island points just outside it, along the ray from him.
  for (const c of [...candidates]) {
    const kx = c.x - KRAKEN.x;
    const kz = c.z - KRAKEN.z;
    const kd = Math.hypot(kx, kz) || 1;
    if (kd <= KRAKEN_KEEP_OUT + margin) candidates.push({ x: KRAKEN.x + (kx / kd) * (KRAKEN_KEEP_OUT + margin + 0.3), z: KRAKEN.z + (kz / kd) * (KRAKEN_KEEP_OUT + margin + 0.3) });
  }
  // The village island (a circle) and the bridge (a strip).
  const vx = x - VILLAGE.x;
  const vz = z - VILLAGE.z;
  const vd = Math.hypot(vx, vz) || 1;
  const vr = Math.min(vd, VILLAGE.radius - m);
  candidates.push({ x: VILLAGE.x + (vx / vd) * vr, z: VILLAGE.z + (vz / vd) * vr });
  const bw = BRIDGE.halfWidth - 0.6 - margin - 0.05;
  if (bw > 0) candidates.push({ x: VILLAGE.x + Math.max(-bw, Math.min(bw, x - VILLAGE.x)), z: Math.max(BRIDGE.toZ, Math.min(BRIDGE.fromZ, z)) });
  const inside = candidates.filter((c) => oceanInside(c.x, c.z, margin - 0.05));
  const pool = inside.length > 0 ? inside : candidates;
  pool.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  return pool[0];
}

/** The ground grid shared by the physics heightfield and the drawn sand. */
export const OCEAN_GRID = { minX: -96, maxX: 96, minZ: -480, maxZ: 52, cell: 2 } as const;

/** The length of one curtain-wall block (a little more than its share of the ring, so blocks overlap). */
export function wallSegmentLength(): number {
  return (Math.PI * 2 * CASTLE_WALL.radius) / CASTLE_WALL.segments + 0.4;
}

/** Curtain-wall segments (centres and yaw), leaving the gate open to the south. */
export function castleWallSegments(): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const count = CASTLE_WALL.segments;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < CASTLE_WALL.gateHalfAngle) continue;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI))) < BACK_GATE_HALF_ANGLE) continue;
    out.push({ x: CASTLE.x + Math.sin(a) * CASTLE_WALL.radius, z: CASTLE.z + Math.cos(a) * CASTLE_WALL.radius, yaw: a });
  }
  return out;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The keep's wall blocks (centres, yaw and length): each side is an arc from
 * the edge of the doorway (south) to the edge of the back opening (north),
 * cut into equal blocks so the wall meets both openings exactly (no gaps to
 * see through beside the door).
 */
export function keepWallSegments(): Array<{ x: number; z: number; yaw: number; length: number }> {
  const out: Array<{ x: number; z: number; yaw: number; length: number }> = [];
  const r = KEEP.radius;
  const doorHalf = Math.asin(KEEP_DOOR.halfWidth / r);
  const backHalf = Math.asin(KEEP_BACK_OPENING_HALF / r);
  const arc = Math.PI - backHalf - doorHalf;
  const n = Math.ceil((arc * KEEP_WALL.segments) / (Math.PI * 2));
  const step = arc / n;
  const length = 2 * r * Math.sin(step / 2) + 0.3;
  for (const side of [1, -1]) {
    for (let k = 0; k < n; k += 1) {
      const a = side * (doorHalf + (k + 0.5) * step);
      out.push({ x: KEEP.x + Math.sin(a) * r, z: KEEP.z + Math.cos(a) * r, yaw: a, length });
    }
  }
  return out;
}

/**
 * The stairs: `count` steps up to the plinth in front of the door (toward
 * +z) and down from the back opening (toward −z). Each step is a box: centre,
 * half sizes and the height of its top above the ground at the keep.
 */
export function keepSteps(): Array<{ x: number; z: number; halfX: number; halfZ: number; top: number }> {
  const out: Array<{ x: number; z: number; halfX: number; halfZ: number; top: number }> = [];
  const { count, run } = KEEP_STEPS;
  for (const [dir, halfWidth] of [[1, KEEP_DOOR.halfWidth + 1.2], [-1, KEEP_BACK_OPENING_HALF + 0.5]] as const) {
    for (let k = 0; k < count; k += 1) {
      // Step k (0 = lowest, outermost): runs from the plinth's edge outward.
      const top = (KEEP_PLINTH.top * (k + 1)) / (count + 1);
      // Tucked under the round plinth's edge even at the stair's corners.
      const inner = Math.sqrt(KEEP_PLINTH.radius ** 2 - halfWidth ** 2) - 0.3;
      const outer = KEEP_PLINTH.radius + (count - k) * run;
      out.push({ x: KEEP.x, z: KEEP.z + dir * (inner + outer) / 2, halfX: halfWidth, halfZ: (outer - inner) / 2, top });
    }
  }
  return out;
}

/** Where the keep's door stands, in its doorway (flush with the wall). */
export const KEEP_DOOR_SPOT = { x: KEEP.x, z: KEEP.z + KEEP.radius, rotationY: 0 } as const;

/** The keep's colonnade: columns round the drum, none in front of the door or across the back opening. */
export function keepColumns(): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const r = KEEP.radius + 1.8;
  const backClear = Math.asin(KEEP_BACK_OPENING_HALF / KEEP.radius) + 0.12;
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(wrapAngle(a)) < COLONNADE_CLEAR || Math.abs(wrapAngle(a - Math.PI)) < backClear) continue;
    out.push({ x: KEEP.x + Math.sin(a) * r, z: KEEP.z + Math.cos(a) * r });
  }
  return out;
}

/** The avenue's paired columns from the gate to the keep. */
export function avenueColumns(): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = [];
  const gateZ = CASTLE.z + CASTLE_WALL.radius;
  for (let z = gateZ - 8; z > KEEP.z + KEEP.radius + 8; z -= 9) {
    if (Math.abs(z - STATUE.z) < STATUE.radius + 3) continue;
    for (const side of [-1, 1]) out.push({ x: side * 7.5, z });
  }
  return out;
}

/** The great pillars either side of the front gate and the back gate. */
export function gatePillars(): Array<{ x: number; z: number; radius: number }> {
  const front = CASTLE_GATE_HALF + 1.4;
  const backHalf = (() => {
    const step = (Math.PI * 2) / CASTLE_WALL.segments;
    let first = Math.PI;
    for (let i = 0; i < CASTLE_WALL.segments; i += 1) {
      const a = i * step;
      if (Math.abs(wrapAngle(a - Math.PI)) >= BACK_GATE_HALF_ANGLE) first = Math.min(first, Math.abs(wrapAngle(a - Math.PI)));
    }
    return Math.sin(first) * CASTLE_WALL.radius - wallSegmentLength() / 2;
  })();
  const back = backHalf + 1.4;
  return [
    { x: -front, z: CASTLE.z + CASTLE_WALL.radius, radius: 1.9 },
    { x: front, z: CASTLE.z + CASTLE_WALL.radius, radius: 1.9 },
    { x: -back, z: CASTLE.z - CASTLE_WALL.radius, radius: 1.9 },
    { x: back, z: CASTLE.z - CASTLE_WALL.radius, radius: 1.9 },
  ];
}

/** The humans' tents in the courtyard (x, z, yaw); each a cone 2.4 m across at the base. */
export const TENTS: ReadonlyArray<readonly [number, number, number]> = [
  [-20, CASTLE.z + 40, 0.4], [-38, CASTLE.z - 8, -0.6], [36, CASTLE.z + 22, 2.4], [-16, CASTLE.z + 12, 1.1], [16, CASTLE.z - 40, 0.2], [-40, CASTLE.z + 18, 2],
];
/** Scaffolds against the curtain wall (the angle round the castle). */
export const SCAFFOLD_ANGLES: readonly number[] = [-1.1, 2.2];
/** Giant clams: in the courtyard's corners and on the beach (x, z, radius, yaw). */
export const GIANT_CLAMS: ReadonlyArray<readonly [number, number, number, number]> = [
  [-36, CASTLE.z + 30, 2.2, 0.6], [36, CASTLE.z + 32, 2.2, -0.6], [-12, CASTLE.z - 42, 2.2, 0.2],
  [22, 30, 1.4, -0.8], [-6, 34, 1.1, 0.3], [26, 20, 0.9, -1.4],
];
/** The humans' supply crates either side of the avenue near the gate (x, z, size, yaw): fixed, so physics and the view agree. */
export const CRATES: ReadonlyArray<readonly [number, number, number, number]> = (() => {
  let seed = 4127;
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: 14 }, (_, i) => {
    const x = (i % 2 ? 1 : -1) * (12 + next() * 10);
    const z = CASTLE.z + 26 + next() * 18;
    return [x, z, 0.7 + next() * 0.4, next() * 3] as const;
  });
})();
