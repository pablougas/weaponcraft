import { freedPoints } from '../cutscenes/freed';
import { groundAt, OCEAN, oceanPoint, regionOf, type RegionId } from '../regions';
import { OCEAN_ARRIVAL, SEA_GATE } from '../terrain/ocean';
import type { Entity, EntityId, PlayerId, Vec3 } from '../types';
import { spawn, type SimContext } from '../world';
import { placeAtlantisGarrison } from './soldiers';

/**
 * Poseidon's sea-gate (team request, Nov 15): once Cerberus is free, the
 * spout Poseidon rose from at the Gates stays open as a gate to his sea, with
 * a twin on the Ocean's beach. F steps through, and the companion god comes
 * too. The humans who took Atlantis are placed then.
 */
export const SEA_GATE_BODY = { radius: 1.0, height: 3.2 } as const;

/** The Gates' end: where it stands, which way it faces, and where travellers step out. */
export function gatesEnd(): { at: Vec3; yaw: number; arrival: Vec3 } {
  const p = freedPoints();
  const yaw = Math.atan2(p.zeus.x - p.spring.x, p.zeus.z - p.spring.z);
  // A few metres behind Poseidon's spring, so F at the gate isn't taken by "Talk to Poseidon".
  const gx = p.spring.x - Math.sin(yaw) * 3;
  const gz = p.spring.z - Math.cos(yaw) * 3;
  return { at: { x: gx, y: groundAt('underworld', gx, gz), z: gz }, yaw, arrival: { ...p.spring } };
}

function placeGate(ctx: SimContext, region: RegionId, at: Vec3, yaw: number, to: RegionId): EntityId {
  const id = spawn(ctx, 'sea-gate', { position: { ...at }, rotationY: yaw });
  Object.assign(ctx.world.entities[id], { region, structure: { kind: 'sea-gate', to }, body: { ...SEA_GATE_BODY } } satisfies Partial<Entity>);
  return id;
}

/** Opens the sea-gate once Cerberus is free (also for saves from before it existed). */
export function ensureSeaGate(ctx: SimContext): void {
  const { world } = ctx;
  if (!world.flags.cerberusFreed || world.flags.seaGateOpen) return;
  const gates = gatesEnd();
  placeGate(ctx, 'underworld', gates.at, gates.yaw, 'ocean');
  placeGate(ctx, 'ocean', oceanPoint(SEA_GATE.x, SEA_GATE.z), Math.PI, 'underworld');
  if (!world.flags.atlantisGarrisoned) placeAtlantisGarrison(ctx);
  world.flags.seaGateOpen = true;
  ctx.emit('sea-gate:opened', {});
}

/** F at a sea-gate: the player's god steps through to the other side. */
export function travelThroughSeaGate(ctx: SimContext, playerId: PlayerId, gate: Entity): string | null {
  const player = ctx.world.players[playerId];
  const hero = player?.entityId ? ctx.world.entities[player.entityId] : undefined;
  const to = gate.structure?.to;
  if (!hero?.hero || !to) return 'nothing to use';
  if (hero.hero.down != null) return 'down';
  const from = regionOf(hero);
  let arrival: Vec3;
  let yaw: number;
  if (to === 'ocean') {
    arrival = oceanPoint(OCEAN_ARRIVAL.x, OCEAN_ARRIVAL.z);
    yaw = OCEAN_ARRIVAL.rotationY;
  } else {
    const gates = gatesEnd();
    arrival = gates.arrival;
    yaw = gates.yaw;
  }
  // The whole party steps through together: the companion comes out beside and a little behind.
  const party = (player.party ?? [hero.id]).map((id) => ctx.world.entities[id]).filter((e): e is Entity => !!e?.hero && (e.id === hero.id || e.hero.down == null));
  party.forEach((god, i) => {
    const side = i === 0 ? 0 : 1.6;
    const back = i === 0 ? 0 : 1.4;
    const x = arrival.x + Math.cos(yaw) * side - Math.sin(yaw) * back;
    const z = arrival.z - Math.sin(yaw) * side - Math.cos(yaw) * back;
    const at = { x, y: groundAt(to, x, z), z };
    god.region = to;
    god.position = at;
    god.rotationY = yaw;
    Object.assign(god.hero!, { vy: 0, grounded: true, dodge: null, blink: null, lockTarget: null, moving: false, lastSafe: { ...at }, companionStuck: 0, companionLast: { ...at } });
  });
  ctx.emit('sea-gate:travel', { playerId, entityId: hero.id, from, to });
  return null;
}

/** The Ocean's centre, for the view and tests. */
export const OCEAN_CENTER = OCEAN.center;
