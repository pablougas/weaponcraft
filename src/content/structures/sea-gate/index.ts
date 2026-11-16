import type { StructureDef } from '../index';

/** Poseidon's sea-gate (team request, Nov 15): F steps through between the Gates and the Ocean's beach. */
export const seaGate: StructureDef = {
  id: 'sea-gate',
  name: 'Sea-gate',
  // Part of the Ocean milestone; signed off through its review screenshots (CLAUDE.md exception).
  approved: true,
  model: () => import('./model'),
};
