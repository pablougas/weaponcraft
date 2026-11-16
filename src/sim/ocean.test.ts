import { beforeAll, describe, expect, it } from 'vitest';
import { loadPhysics } from '../engine/physics';
import type { Intent } from './intents';
import { PhysicsWorld, type Rapier } from './physics';
import { ensureMeadowPopulated, ensureStory } from './populate';
import { groundAt, OCEAN, regionClamp } from './regions';
import { deserialize, serialize } from './serialize';
import { nearestInteractable } from './systems/items';
import { ensureSeaGate, gatesEnd } from './systems/sea-gate';
import { CASTLE, CASTLE_WALL, KEEP, KRAKEN, OCEAN_ARRIVAL, oceanClamp, oceanInside, SEA_GATE, SHIPWRECK } from './terrain/ocean';
import { tickWorld } from './tick';
import { TUTORIAL_STEPS } from './tutorial';
import type { WorldState } from './types';
import { createSimContext, createWorld, spawn } from './world';
import { freedPoints } from './cutscenes/freed';

let R: Rapier;
beforeAll(async () => {
  R = await loadPhysics();
});

/** Cerberus is free (as after the freed scene): Zeus and Hades at the Gates' plaza. */
function freed(physics = false) {
  const world = createWorld(7, 1_000);
  ensureMeadowPopulated(world);
  const phys = physics ? new PhysicsWorld(R) : undefined;
  const run = (intents: Intent[] = [], n = 1) => {
    const events = [];
    for (let t = 0; t < n; t += 1) events.push(...tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [], physics: phys }));
    return events;
  };
  run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
  run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
  run([{ type: 'cutscene:skip', playerId: 'p1' }]);
  run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
  world.flags.cerberusFreed = true;
  const { ctx, events } = createSimContext(world, true);
  // Poseidon where the freed scene leaves him, beside his spring.
  const poseidon = spawn(ctx, 'poseidon', { position: freedPoints().poseidon });
  Object.assign(world.entities[poseidon], { npc: { name: 'Poseidon' }, body: { radius: 0.4, height: 2.1 }, region: 'underworld' });
  ensureSeaGate(ctx);
  const zeus = () => world.entities[world.players.p1.entityId!];
  const at = (x: number, z: number) => run([{ type: 'dev:teleport', playerId: 'p1', x, z }], 2);
  const press = (action: string) => run([{ type: 'player:action', playerId: 'p1', action } as Intent]);
  return { world, run, zeus, at, press, opened: events };
}

const gates = (world: WorldState) => Object.values(world.entities).filter((e) => e.structure?.kind === 'sea-gate');
const oceanSoldiers = (world: WorldState) => Object.values(world.entities).filter((e) => e.soldier && e.region === 'ocean');

describe('the Ocean: its shape', () => {
  it('the beach, causeway and castle courtyard are land; the kraken, the sea and the far water are not', () => {
    for (const p of [OCEAN_ARRIVAL, SEA_GATE, { x: 0, z: 0 }, { x: 0, z: -30 }, { x: CASTLE.x, z: CASTLE.z + 10 }, { x: KEEP.x + 10, z: KEEP.z }]) {
      expect(oceanInside(p.x, p.z), `${p.x},${p.z}`).toBe(true);
    }
    for (const p of [KRAKEN, { x: 30, z: 0 }, { x: 0, z: 60 }, { x: -40, z: -20 }]) expect(oceanInside(p.x, p.z), `${p.x},${p.z}`).toBe(false);
    // Land stands above the sea; the sea floor is well under it.
    expect(groundAt('ocean', OCEAN.center.x + OCEAN_ARRIVAL.x, OCEAN.center.z + OCEAN_ARRIVAL.z)).toBeGreaterThan(OCEAN.center.y + 0.4);
    expect(groundAt('ocean', OCEAN.center.x + KRAKEN.x, OCEAN.center.z + KRAKEN.z)).toBeLessThan(OCEAN.center.y - 2);
    // Clamping always lands on land.
    for (const p of [{ x: 50, z: 10 }, { x: 12, z: -20 }, { x: 0, z: 70 }, { x: 45, z: -64 }]) {
      const c = oceanClamp(p.x, p.z, 1);
      expect(oceanInside(c.x, c.z, 0.9), `${p.x},${p.z}`).toBe(true);
    }
    expect(regionClamp('ocean', OCEAN.center.x + 80, OCEAN.center.z, 0).inside).toBe(false);
    // The wreck lies on the beach, clear of the sea-gate.
    expect(Math.hypot(SHIPWRECK.x - SEA_GATE.x, SHIPWRECK.z - SEA_GATE.z)).toBeGreaterThan(20);
  });
});

describe('the sea-gate and Atlantis (team request, Nov 15)', () => {
  it('opens once Cerberus is free: a gate at the Gates, its twin on the beach, and the humans holding Atlantis', () => {
    const { world, opened } = freed();
    expect(world.flags.seaGateOpen).toBe(true);
    expect(opened.map((e) => e.type)).toContain('sea-gate:opened');
    const [here, there] = [gates(world).find((g) => g.region === 'underworld')!, gates(world).find((g) => g.region === 'ocean')!];
    expect(here.structure).toEqual({ kind: 'sea-gate', to: 'ocean' });
    expect(there.structure).toEqual({ kind: 'sea-gate', to: 'underworld' });
    const soldiers = oceanSoldiers(world);
    expect(soldiers.length).toBe(8);
    expect(soldiers.some((s) => s.soldier!.kind === 'captain')).toBe(true);
    for (const s of soldiers) expect(Math.abs(s.position.y - groundAt('ocean', s.position.x, s.position.z))).toBeLessThan(0.01);
    // Most of them are inside the castle walls.
    const inCastle = soldiers.filter((s) => Math.hypot(s.position.x - OCEAN.center.x - CASTLE.x, s.position.z - OCEAN.center.z - CASTLE.z) < CASTLE_WALL.radius);
    expect(inCastle.length).toBeGreaterThanOrEqual(6);
    // Only once.
    const { ctx } = createSimContext(world, true);
    ensureSeaGate(ctx);
    expect(gates(world)).toHaveLength(2);
    expect(oceanSoldiers(world)).toHaveLength(8);
  });

  it('F steps through to the beach and back; Hades follows; the soldiers there only see gods in their sea', () => {
    const { world, run, zeus, at, press } = freed();
    const g = gatesEnd();
    at(g.arrival.x, g.arrival.z);
    // The gate, not Poseidon, is what F uses there.
    expect(nearestInteractable(world, 'p1')?.structure?.kind).toBe('sea-gate');
    press('interact');
    expect(zeus().region).toBe('ocean');
    expect(zeus().position.x).toBeCloseTo(OCEAN.center.x + OCEAN_ARRIVAL.x, 3);
    expect(zeus().position.z).toBeCloseTo(OCEAN.center.z + OCEAN_ARRIVAL.z, 3);
    // Hades comes through with him, beside and behind (no catch-up needed).
    const hades = Object.values(world.entities).find((e) => e.defId === 'hades' && e.hero)!;
    expect(hades.region).toBe('ocean');
    expect(Math.hypot(hades.position.x - zeus().position.x, hades.position.z - zeus().position.z)).toBeLessThan(2.5);
    expect(run([], 3).some((e) => e.type === 'ability:blink')).toBe(false);
    // Walk up the causeway into the castle's courtyard: the garrison notices.
    at(OCEAN.center.x, OCEAN.center.z + CASTLE.z + CASTLE_WALL.radius - 8);
    run([], 90);
    expect(oceanSoldiers(world).some((s) => s.soldier!.state !== 'patrol')).toBe(true);
    // Back on the beach, F at the gate returns to the Gates.
    at(OCEAN.center.x + OCEAN_ARRIVAL.x, OCEAN.center.z + OCEAN_ARRIVAL.z);
    press('interact');
    expect(zeus().region).toBe('underworld');
    expect(Math.hypot(zeus().position.x - g.arrival.x, zeus().position.z - g.arrival.z)).toBeLessThan(0.01);
  });

  it('with physics: you stand on the sand, the sea and the castle wall stop you, the gate lets you in', () => {
    const { world, run, zeus, at, press } = freed(true);
    const g = gatesEnd();
    at(g.arrival.x, g.arrival.z);
    press('interact');
    run([], 10);
    const z0 = zeus();
    expect(z0.region).toBe('ocean');
    expect(Math.abs(z0.position.y - groundAt('ocean', z0.position.x, z0.position.z))).toBeLessThan(0.3);
    // Walk east into the sea for 6 s: the shore stops you.
    run([{ type: 'player:move', playerId: 'p1', x: 1, z: 0 } as Intent], 180);
    expect(regionClamp('ocean', zeus().position.x, zeus().position.z, -0.6).inside).toBe(true);
    // Into the curtain wall beside the gate: it stops you (you slide along its outside). Through the gate: into the courtyard.
    const fromCastle = () => Math.hypot(zeus().position.x - OCEAN.center.x - CASTLE.x, zeus().position.z - OCEAN.center.z - CASTLE.z);
    at(OCEAN.center.x + 10, OCEAN.center.z + CASTLE.z + CASTLE_WALL.radius + 5);
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1 } as Intent], 150);
    expect(fromCastle()).toBeGreaterThan(CASTLE_WALL.radius);
    at(OCEAN.center.x, OCEAN.center.z + CASTLE.z + CASTLE_WALL.radius + 5);
    run([{ type: 'player:move', playerId: 'p1', x: 0, z: -1 } as Intent], 150);
    expect(fromCastle()).toBeLessThan(CASTLE_WALL.radius - 3);
    void world;
  });

  it('survives a save, and an older save where Cerberus is already free gets the gate on load', () => {
    const { world } = freed();
    const restored = deserialize(serialize(world));
    expect(gates(restored)).toHaveLength(2);
    // An older save: Cerberus free, no gate yet.
    const old = deserialize(serialize(world));
    for (const e of [...gates(old), ...oceanSoldiers(old)]) delete old.entities[e.id];
    delete old.flags.seaGateOpen;
    delete old.flags.atlantisGarrisoned;
    ensureStory(old);
    ensureStory(old);
    expect(gates(old)).toHaveLength(2);
    expect(oceanSoldiers(old)).toHaveLength(8);
  });
});
