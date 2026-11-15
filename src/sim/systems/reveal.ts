import { ticks } from '../constants';
import { GROTTO } from '../regions';
import { FIELDS, FORT_SPOTS } from '../terrain/underworld';
import type { WorldState } from '../types';
import type { SimContext } from '../world';

/**
 * Fog of war for the Underworld map (SPEC §4.1, M6): a coarse grid of 16 m
 * cells over the grotto, tunnel and fields, stored in WorldState as a string
 * of '0'/'1' (saved, and ready to merge across players in co-op). Each god
 * reveals 60 m around them; forts are marked once revealed.
 */
export const REVEAL_CELL = 16;
export const REVEAL_RADIUS = 60;
export const REVEAL_BOUNDS = { minX: FIELDS.minX, maxX: FIELDS.maxX, minZ: FIELDS.minZ, maxZ: 40 } as const;
export const REVEAL_COLS = Math.ceil((REVEAL_BOUNDS.maxX - REVEAL_BOUNDS.minX) / REVEAL_CELL);
export const REVEAL_ROWS = Math.ceil((REVEAL_BOUNDS.maxZ - REVEAL_BOUNDS.minZ) / REVEAL_CELL);
const EVERY = ticks(0.5);

export function revealGrid(world: WorldState): string {
  const want = REVEAL_COLS * REVEAL_ROWS;
  const grid = world.reveal?.underworld ?? '';
  return grid.length === want ? grid : '0'.repeat(want);
}

/** Is the cell containing (x, z) (grotto-local metres) revealed? */
export function isRevealed(grid: string, x: number, z: number): boolean {
  const c = Math.floor((x - REVEAL_BOUNDS.minX) / REVEAL_CELL);
  const r = Math.floor((z - REVEAL_BOUNDS.minZ) / REVEAL_CELL);
  if (c < 0 || r < 0 || c >= REVEAL_COLS || r >= REVEAL_ROWS) return false;
  return grid[r * REVEAL_COLS + c] === '1';
}

export function updateReveal(ctx: SimContext): void {
  const { world } = ctx;
  if (world.tick % EVERY !== 0) return;
  let grid: string[] | null = null;
  for (const entity of Object.values(world.entities)) {
    if (!entity.hero || entity.region !== 'underworld') continue;
    grid ??= revealGrid(world).split('');
    const x = entity.position.x - GROTTO.center.x;
    const z = entity.position.z - GROTTO.center.z;
    const span = Math.ceil(REVEAL_RADIUS / REVEAL_CELL);
    const c0 = Math.floor((x - REVEAL_BOUNDS.minX) / REVEAL_CELL);
    const r0 = Math.floor((z - REVEAL_BOUNDS.minZ) / REVEAL_CELL);
    for (let r = r0 - span; r <= r0 + span; r += 1) {
      for (let c = c0 - span; c <= c0 + span; c += 1) {
        if (c < 0 || r < 0 || c >= REVEAL_COLS || r >= REVEAL_ROWS) continue;
        const cx = REVEAL_BOUNDS.minX + (c + 0.5) * REVEAL_CELL;
        const cz = REVEAL_BOUNDS.minZ + (r + 0.5) * REVEAL_CELL;
        if (Math.hypot(cx - x, cz - z) <= REVEAL_RADIUS) grid[r * REVEAL_COLS + c] = '1';
      }
    }
  }
  if (!grid) return;
  const next = grid.join('');
  if (next === world.reveal.underworld) return;
  world.reveal.underworld = next;
  for (const fort of FORT_SPOTS) {
    const state = world.forts[fort.id];
    if (state && !state.seen && isRevealed(next, fort.x, fort.z)) {
      state.seen = true;
      ctx.emit('fort:spotted', { fortId: fort.id });
    }
  }
}
