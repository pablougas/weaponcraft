import { describe, expect, it } from 'vitest';
import { loadPhysics } from '../engine/physics';
import { PhysicsWorld } from './physics';
import { meadowHeightAt } from './terrain/meadow';
import { HERO_ROCK_TOP } from './terrain/meadow';

describe('PhysicsWorld', () => {
  it('the terrain collider matches the meadow height', async () => {
    const physics = new PhysicsWorld(await loadPhysics());
    physics.step();
    // Off the 2 m grid lines: a vertical ray exactly through a vertex can slip between triangles.
    for (const [x, z] of [[20.3, 30.7], [-40.3, 12.9], [60.5, -70.1], [-15.1, -35.3]]) {
      const ground = physics.groundBelow(x, 200, z)!;
      expect(Math.abs(ground - meadowHeightAt(x, z))).toBeLessThan(0.35);
    }
    expect(physics.groundBelow(0, 200, 0)!).toBeCloseTo(HERO_ROCK_TOP, 1);
    physics.free();
  });
});

describe('tree trunks', () => {
  it('block the hero: walking into a trunk never passes through it', async () => {
    const { MEADOW_TREES, trunkRadius } = await import('./terrain/meadow-trees');
    const { createWorld } = await import('./world');
    const { ensureMeadowPopulated } = await import('./populate');
    const { tickWorld } = await import('./tick');
    const physics = new PhysicsWorld(await loadPhysics());
    // A tree on fairly level ground near the middle of the meadow.
    const tree = [...MEADOW_TREES].sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))
      .find((t) => Math.abs(meadowHeightAt(t.x - 4, t.z) - meadowHeightAt(t.x, t.z)) < 1)!;
    const world = createWorld(1, 0);
    ensureMeadowPopulated(world);
    for (const e of Object.values(world.entities)) if (!e.hero) delete world.entities[e.id];
    tickWorld(world, { nowMs: 0, isAuthority: true, physics, intents: [{ type: 'dev:teleport', playerId: 'p1', x: tree.x - 4, z: tree.z }] });
    const hero = world.entities[world.players.p1.entityId!];
    let closest = Infinity;
    for (let t = 0; t < 60; t += 1) {
      tickWorld(world, { nowMs: 0, isAuthority: true, physics, intents: [{ type: 'player:move', playerId: 'p1', x: 1, z: 0, sprint: false, jumpHeld: false }] });
      closest = Math.min(closest, Math.hypot(hero.position.x - tree.x, hero.position.z - tree.z));
    }
    // Walking straight at the trunk: the hero may slide around it, but never through it.
    // (Without trunk colliders the closest approach is ~0 m.)
    expect(closest).toBeGreaterThan(trunkRadius(tree) + hero.body!.radius - 0.1);
    physics.free();
  });
});

describe('the Asphodel Fields collider', () => {
  it('matches the drawn ground mesh everywhere (no invisible walls, no floating)', async () => {
    const THREE = await import('three');
    const { GROTTO } = await import('./regions');
    const { FIELDS, FIELDS_CELL, FORT_SPOTS, FORT_RADIUS, GATES, SPIRES, TUNNEL, underworldGroundHeight, underworldLocalHeight } = await import('./terrain/underworld');
    const physics = new PhysicsWorld(await loadPhysics());
    physics.step();
    // The same ground mesh the view builds (src/view/underworld/fields.ts).
    const maxZ = TUNNEL.toZ + 22;
    const nx = Math.round((FIELDS.maxX - FIELDS.minX) / FIELDS_CELL);
    const nz = Math.round((maxZ - FIELDS.minZ) / FIELDS_CELL);
    const geo = new THREE.PlaneGeometry(nx * FIELDS_CELL, nz * FIELDS_CELL, nx, nz);
    geo.rotateX(-Math.PI / 2);
    geo.translate(FIELDS.minX + (nx * FIELDS_CELL) / 2, 0, FIELDS.minZ + (nz * FIELDS_CELL) / 2);
    const gp = geo.attributes.position;
    for (let i = 0; i < gp.count; i += 1) gp.setY(i, underworldLocalHeight(gp.getX(i), gp.getZ(i)));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    const c = GROTTO.center;
    let worst = 0;
    let worstPlaced = 0;
    let checked = 0;
    // Inside grid cells (a ray exactly on a grid line can slip between triangles), across the whole non-square field.
    for (let x = FIELDS.minX + 30 + 1.1; x < FIELDS.maxX - 30; x += 17.5) {
      for (let z = FIELDS.minZ + 30 + 0.9; z < FIELDS.maxZ - 5; z += 12.5) {
        if (SPIRES.some((sp) => Math.hypot(sp.x - x, sp.z - z) < sp.radius * 2 + 2)) continue;
        if (FORT_SPOTS.some((f) => Math.hypot(f.x - x, f.z - z) < FORT_RADIUS + 3)) continue;
        if (Math.hypot(GATES.x - x, GATES.z - z) < 40) continue;
        const ground = physics.groundBelow(c.x + x, c.y + 120, c.z + z)! - c.y;
        ray.set(new THREE.Vector3(x, 120, z), new THREE.Vector3(0, -1, 0));
        const drawn = ray.intersectObject(mesh)[0].point.y;
        worst = Math.max(worst, Math.abs(ground - drawn));
        // What the sim places things on (groundAt) is the same surface.
        worstPlaced = Math.max(worstPlaced, Math.abs(underworldGroundHeight(x, z) - ground));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(worst).toBeLessThan(0.05);
    expect(worstPlaced).toBeLessThan(0.05);
    physics.free();
  });
});

describe('soldiers on the Underworld ground', () => {
  it('stay on the surface (never sink through it) over 20 s of patrols', async () => {
    const { createWorld } = await import('./world');
    const { ensureMeadowPopulated } = await import('./populate');
    const { tickWorld } = await import('./tick');
    const { TUTORIAL_STEPS } = await import('./tutorial');
    const { groundAt } = await import('./regions');
    const physics = new PhysicsWorld(await loadPhysics());
    const world = createWorld(7, 1_000);
    ensureMeadowPopulated(world);
    type Intent = import('./intents').Intent;
    const run = (intents: Intent[] = [], n = 1) => {
      for (let t = 0; t < n; t += 1) tickWorld(world, { nowMs: 1_000 + world.tick * 33, isAuthority: true, intents: t === 0 ? intents : [], physics });
    };
    run([{ type: 'player:declare', playerId: 'p1', seenRocket: true, seenCutscenes: ['rocket', 'descent'] }]);
    run(TUTORIAL_STEPS.map((stepId) => ({ type: 'dev:tutorial', playerId: 'p1', stepId }) as Intent));
    run([{ type: 'cutscene:skip', playerId: 'p1' }]);
    run([{ type: 'cutscene:skip', playerId: 'p1' }], 3);
    run([], 600);
    const soldiers = Object.values(world.entities).filter((e) => e.soldier);
    expect(soldiers.length).toBeGreaterThan(20);
    const worst = Math.max(...soldiers.map((e) => groundAt('underworld', e.position.x, e.position.z) - e.position.y));
    expect(worst).toBeLessThan(0.3);

    // A soldier saved underground (e.g. from before the fields' collider was fixed) climbs back out at once.
    const sunk = soldiers.find((e) => !e.soldier!.squadId)!;
    sunk.position = { ...sunk.position, y: groundAt('underworld', sunk.position.x, sunk.position.z) - 3 };
    run([], 2);
    expect(world.entities[sunk.id].position.y).toBeGreaterThan(groundAt('underworld', sunk.position.x, sunk.position.z) - 0.3);
    physics.free();
  });
});
