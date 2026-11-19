import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { meadowHeightAt } from './terrain/meadow';
import { GROTTO_SPOTS } from './cutscenes/descent';
import { GROTTO, OCEAN } from './regions';
import { avenueColumns, BRIDGE, CASTLE, VILLAGE, VILLAGE_FOUNTAIN, VILLAGE_HOUSES, villageHouse, villageHouseHeights, CASTLE_TOWERS, CASTLE_WALL, castleWallSegments, COLUMN_RADIUS, CRATES, gatePillars, GIANT_CLAMS, KEEP, KEEP_DOOR, KEEP_DOOR_SPOT, KEEP_PLINTH, keepSteps, KEEP_WALL, keepColumns, keepWallSegments, KRAKEN_MECH_SIZE, KRAKEN_RIG, OCEAN_GRID, oceanLocalHeight, SCAFFOLD_ANGLES, SHIPWRECK, STATUE, TEMPLES, TENTS, TOWER, wallSegmentLength } from './terrain/ocean';
import { CERBERUS_POST, FIELDS, FIELDS_CELL, FORT_SPOTS, GATE_PILLARS, MECH_SIZE, palisadeSegments, spireBase, SPIRES, TUNNEL, underworldLocalHeight, watchtowerSpot } from './terrain/underworld';
import { heroRockHullPoints, MEADOW_ROCKS, rockColliderRadius } from './terrain/meadow-rocks';
import { MEADOW_TREES, trunkRadius } from './terrain/meadow-trees';
import type { EntityId, Vec3, WorldState } from './types';

export type Rapier = typeof RAPIER_NS;

/** Side of the square heightfield around the meadow, metres. */
const TERRAIN_EXTENT = 320;
/** Heightfield cells per side (2 m cells). */
const TERRAIN_CELLS = 160;

interface BodyRecord {
  body: RAPIER_NS.RigidBody;
  collider: RAPIER_NS.Collider;
  /** Height of the capsule centre above the entity's feet. */
  centerOffset: number;
}

export interface MoveResult {
  /** New feet position. */
  position: Vec3;
  grounded: boolean;
}

/**
 * Rapier collision for the sim (CLAUDE.md rule 7: Rapier steps with the sim).
 * It's a cache rebuilt from `WorldState`, never the source of truth: each tick
 * the sim syncs bodies from state, steps, moves characters with the kinematic
 * character controller, and writes positions back into state.
 */
export class PhysicsWorld {
  private readonly world: RAPIER_NS.World;
  private readonly controller: RAPIER_NS.KinematicCharacterController;
  private readonly bodies = new Map<EntityId, BodyRecord>();
  /** The humans' barricade across the tunnel (removed once it's torn down). */
  private barricade: RAPIER_NS.Collider | null = null;
  /** The door of Atlantis's keep: solid until it's opened (team request, Nov 16). */
  private keepDoor: RAPIER_NS.Collider | null = null;
  /** The village bridge (Nov 17): its deck is solid once it has risen; until then a barrier closes its end. */
  private bridgeDeck: RAPIER_NS.Collider | null = null;
  /** Colliders on moving bodies that still keep the camera out (the mechs; characters don't). */
  private readonly cameraBlockers = new Set<number>();
  private bridgeBarrier: RAPIER_NS.Collider | null = null;

  constructor(private readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    this.addTerrain();
    this.addRocks();
    this.addGrotto();
    this.addOcean();
    this.controller = this.world.createCharacterController(0.04);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.controller.enableAutostep(0.45, 0.25, false);
    this.controller.enableSnapToGround(0.45);
    this.controller.setSlideEnabled(true);
  }

  private addTerrain(): void {
    const n = TERRAIN_CELLS;
    const heights = new Float32Array((n + 1) * (n + 1));
    // Rapier stores heights column-major: the fast index runs along z, the slow one along x.
    for (let ix = 0; ix <= n; ix += 1) {
      for (let iz = 0; iz <= n; iz += 1) {
        const x = (ix / n - 0.5) * TERRAIN_EXTENT;
        const z = (iz / n - 0.5) * TERRAIN_EXTENT;
        heights[iz + ix * (n + 1)] = meadowHeightAt(x, z);
      }
    }
    const desc = this.R.ColliderDesc.heightfield(n, n, heights, { x: TERRAIN_EXTENT, y: 1, z: TERRAIN_EXTENT });
    this.world.createCollider(desc);
  }

  /**
   * The Outer Grotto (M5.1), deep below the meadow: a floor slab, a ring of
   * rock walls with the tunnel north, the humans' conduit rig, and their
   * barricade across the tunnel (it opens in M6).
   */
  private addGrotto(): void {
    const c = GROTTO.center;
    const R = this.R;
    this.world.createCollider(R.ColliderDesc.cuboid(40, 0.5, 40).setTranslation(c.x, c.y - 0.5, c.z));
    const wallRadius = GROTTO.radius + 1.6;
    const segments = 28;
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      // Leave the tunnel mouth open to the north (−z); the barricade closes it.
      if (Math.abs(Math.atan2(Math.sin(a - GROTTO.tunnelBearing), Math.cos(a - GROTTO.tunnelBearing))) < 0.16) continue;
      const desc = R.ColliderDesc.cuboid(2.6, 6, 0.8)
        .setTranslation(c.x + Math.sin(a) * wallRadius, c.y + 6, c.z + Math.cos(a) * wallRadius)
        .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
      this.world.createCollider(desc);
    }
    const rig = GROTTO_SPOTS.rig;
    this.world.createCollider(R.ColliderDesc.cuboid(1.6, 1.4, 1.1).setTranslation(c.x + rig.x, c.y + 1.4, c.z + rig.z));
    const gate = GROTTO_SPOTS.barricade;
    // Wall to wall, so nobody slips round its ends; removed when it's torn down (M6).
    this.barricade = this.world.createCollider(R.ColliderDesc.cuboid(7.5, 2.5, 0.5).setTranslation(c.x + gate.x, c.y + 2.5, c.z + gate.z));
    // The tunnel's walls, out to the Asphodel Fields.
    const length = (TUNNEL.fromZ - TUNNEL.toZ) / 2 + 3;
    for (const side of [-1, 1]) {
      this.world.createCollider(R.ColliderDesc.cuboid(0.6, 6, length).setTranslation(c.x + side * (TUNNEL.halfWidth + 0.6), c.y + 6, c.z + (TUNNEL.fromZ + TUNNEL.toZ) / 2 - 3));
    }
    // Spires, the Gates' pillars and Cerberus's chain post (the Mk. II moves: see syncFrom).
    for (const spire of SPIRES) {
      this.world.createCollider(R.ColliderDesc.cylinder(spire.height / 2, spire.radius * 0.8).setTranslation(c.x + spire.x, c.y + spireBase(spire) + spire.height / 2, c.z + spire.z));
    }
    for (const pillar of GATE_PILLARS) this.world.createCollider(R.ColliderDesc.cylinder(15, 3.2).setTranslation(c.x + pillar.x, c.y + 14, c.z + pillar.z));
    this.world.createCollider(R.ColliderDesc.cylinder(3, 1).setTranslation(c.x + CERBERUS_POST.x, c.y + 3, c.z + CERBERUS_POST.z));
    // The forts' palisades and watchtowers.
    for (const fort of FORT_SPOTS) {
      for (const seg of palisadeSegments(fort)) {
        this.world.createCollider(R.ColliderDesc.cuboid(2.0, 1.7, 0.3)
          .setTranslation(c.x + seg.x, c.y + 1.7, c.z + seg.z)
          .setRotation({ x: 0, y: Math.sin(seg.yaw / 2), z: 0, w: Math.cos(seg.yaw / 2) }));
      }
      const tower = watchtowerSpot(fort);
      this.world.createCollider(R.ColliderDesc.cuboid(1.6, 4, 1.6).setTranslation(c.x + tower.x, c.y + 4, c.z + tower.z));
    }
    // The fields' ground (a heightfield on the same grid the view draws).
    const nx = Math.round((FIELDS.maxX - FIELDS.minX) / FIELDS_CELL);
    const maxZ = TUNNEL.toZ + 22;
    const nz = Math.round((maxZ - FIELDS.minZ) / FIELDS_CELL);
    const heights = new Float32Array((nx + 1) * (nz + 1));
    for (let ix = 0; ix <= nx; ix += 1) {
      for (let iz = 0; iz <= nz; iz += 1) {
        const x = FIELDS.minX + ix * FIELDS_CELL;
        const z = FIELDS.minZ + iz * FIELDS_CELL;
        heights[iz + ix * (nz + 1)] = underworldLocalHeight(x, z);
      }
    }
    // Rapier's heightfield takes (rows along z, columns along x); the meadow is square so it never mattered there.
    const extentX = nx * FIELDS_CELL;
    const extentZ = nz * FIELDS_CELL;
    this.world.createCollider(R.ColliderDesc.heightfield(nz, nx, heights, { x: extentX, y: 1, z: extentZ })
      .setTranslation(c.x + FIELDS.minX + extentX / 2, c.y, c.z + FIELDS.minZ + extentZ / 2));
  }

  /**
   * The Ocean (team request, Nov 15): the sand (a heightfield), the castle's
   * curtain wall, towers and keep, the humans' rig and the wrecked ship.
   */
  private addOcean(): void {
    const c = OCEAN.center;
    const R = this.R;
    const g = OCEAN_GRID;
    const nx = Math.round((g.maxX - g.minX) / g.cell);
    const nz = Math.round((g.maxZ - g.minZ) / g.cell);
    const heights = new Float32Array((nx + 1) * (nz + 1));
    for (let ix = 0; ix <= nx; ix += 1) {
      for (let iz = 0; iz <= nz; iz += 1) heights[iz + ix * (nz + 1)] = oceanLocalHeight(g.minX + ix * g.cell, g.minZ + iz * g.cell);
    }
    const extentX = nx * g.cell;
    const extentZ = nz * g.cell;
    this.world.createCollider(R.ColliderDesc.heightfield(nz, nx, heights, { x: extentX, y: 1, z: extentZ })
      .setTranslation(c.x + g.minX + extentX / 2, c.y, c.z + g.minZ + extentZ / 2));
    const yawQ = (yaw: number) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    for (const seg of castleWallSegments()) {
      this.world.createCollider(R.ColliderDesc.cuboid(wallSegmentLength() / 2, CASTLE_WALL.height / 2, 1.1)
        .setTranslation(c.x + seg.x, c.y + CASTLE_WALL.height / 2, c.z + seg.z).setRotation(yawQ(seg.yaw)));
    }
    for (const tower of CASTLE_TOWERS) this.world.createCollider(R.ColliderDesc.cylinder(TOWER.height / 2, TOWER.radius).setTranslation(c.x + tower.x, c.y + TOWER.height / 2, c.z + tower.z));
    // The keep is a hollow hall: a ring of wall blocks with the door and a great opening at the back.
    for (const seg of keepWallSegments()) {
      this.world.createCollider(R.ColliderDesc.cuboid(seg.length / 2, KEEP_WALL.height / 2, KEEP_WALL.thickness / 2)
        .setTranslation(c.x + seg.x, c.y + KEEP_WALL.height / 2, c.z + seg.z).setRotation(yawQ(seg.yaw)));
    }
    // The keep's base is solid (it's the hall's floor), with stairs up to the door and down from the back.
    const ky = c.y + oceanLocalHeight(KEEP.x, KEEP.z);
    const plinthHalf = (KEEP_PLINTH.top + 1) / 2;
    this.world.createCollider(R.ColliderDesc.cylinder(plinthHalf, KEEP_PLINTH.radius).setTranslation(c.x + KEEP.x, ky + KEEP_PLINTH.top - plinthHalf, c.z + KEEP.z));
    for (const step of keepSteps()) {
      const half = (step.top + 1) / 2;
      this.world.createCollider(R.ColliderDesc.cuboid(step.halfX, half, step.halfZ).setTranslation(c.x + step.x, ky + step.top - half, c.z + step.z));
    }
    this.keepDoor = this.world.createCollider(R.ColliderDesc.cuboid(KEEP_DOOR.halfWidth + 0.3, KEEP_DOOR.height / 2, 0.4)
      .setTranslation(c.x + KEEP_DOOR_SPOT.x, ky + KEEP_PLINTH.top + KEEP_DOOR.height / 2, c.z + KEEP_DOOR_SPOT.z));
    // Everything you could walk through before: columns, the gates' pillars, tents, scaffolds, clams and crates.
    const post = (x: number, z: number, radius: number, height: number) =>
      this.world.createCollider(R.ColliderDesc.cylinder(height / 2, radius).setTranslation(c.x + x, c.y + oceanLocalHeight(x, z) + height / 2 - 0.5, c.z + z));
    for (const col of keepColumns()) post(col.x, col.z, COLUMN_RADIUS, 20);
    // The village (Nov 17): its houses and fountain, and the bridge out to it.
    for (const h of VILLAGE_HOUSES) {
      const at = villageHouse(h);
      const { wall, roofTop } = villageHouseHeights(h);
      post(at.x, at.z, h.radius + 0.2, wall + 0.5);
      // The shell-dome roof, as a solid hull, so the camera can't end up inside it.
      const base = oceanLocalHeight(at.x, at.z) + wall - 0.1;
      const r = h.radius + 0.6;
      const points: number[] = [];
      for (const [ring, up] of [[1, 0], [0.92, 0.4], [0.7, 0.72], [0.38, 0.93]] as const) {
        for (let k = 0; k < 12; k += 1) {
          const a = (k / 12) * Math.PI * 2;
          points.push(Math.sin(a) * r * ring, up * (roofTop - base + 0.1), Math.cos(a) * r * ring);
        }
      }
      points.push(0, roofTop - base + 0.1, 0);
      const hull = this.R.ColliderDesc.convexHull(new Float32Array(points));
      if (hull) this.world.createCollider(hull.setTranslation(c.x + at.x, c.y + base, c.z + at.z));
    }
    post(VILLAGE_FOUNTAIN.x, VILLAGE_FOUNTAIN.z, VILLAGE_FOUNTAIN.radius, 2);
    const bridgeLength = BRIDGE.fromZ - BRIDGE.toZ;
    this.bridgeDeck = this.world.createCollider(R.ColliderDesc.cuboid(BRIDGE.halfWidth, 0.5, bridgeLength / 2)
      .setTranslation(c.x + VILLAGE.x, c.y + BRIDGE.deck - 0.5, c.z + (BRIDGE.fromZ + BRIDGE.toZ) / 2));
    this.bridgeDeck.setEnabled(false);
    this.bridgeBarrier = this.world.createCollider(R.ColliderDesc.cuboid(BRIDGE.halfWidth + 1, 3, 0.4)
      .setTranslation(c.x + VILLAGE.x, c.y + BRIDGE.deck + 2, c.z + BRIDGE.fromZ - 3.2));
    for (const col of avenueColumns()) post(col.x, col.z, 0.65, 8);
    for (const pillar of gatePillars()) post(pillar.x, pillar.z, pillar.radius, CASTLE_WALL.height + 6);
    for (const [x, z] of TENTS) post(x, z, 2.1, 3);
    for (const [x, z, r] of GIANT_CLAMS) post(x, z, r * 0.95, r * 1.2);
    for (const [x, z, size, yaw] of CRATES) {
      this.world.createCollider(R.ColliderDesc.cuboid(size / 2, size / 2, size / 2)
        .setTranslation(c.x + x, c.y + oceanLocalHeight(x, z) + size / 2, c.z + z).setRotation(yawQ(yaw)));
    }
    for (const a of SCAFFOLD_ANGLES) {
      const x = CASTLE.x + Math.sin(a) * (CASTLE_WALL.radius - 2.8);
      const z = CASTLE.z + Math.cos(a) * (CASTLE_WALL.radius - 2.8);
      this.world.createCollider(R.ColliderDesc.cuboid(3.3, CASTLE_WALL.height / 2, 1.2)
        .setTranslation(c.x + x, c.y + oceanLocalHeight(x, z) + CASTLE_WALL.height / 2, c.z + z).setRotation(yawQ(a)));
    }
    for (const t of TEMPLES) this.world.createCollider(R.ColliderDesc.cylinder(6, t.radius + 0.6).setTranslation(c.x + t.x, c.y + 6, c.z + t.z));
    this.world.createCollider(R.ColliderDesc.cylinder(4, STATUE.radius).setTranslation(c.x + STATUE.x, c.y + 3, c.z + STATUE.z));
    this.world.createCollider(R.ColliderDesc.cuboid(1.6, 1.4, 1.1).setTranslation(c.x + KRAKEN_RIG.x, c.y + 3, c.z + KRAKEN_RIG.z));
    this.world.createCollider(R.ColliderDesc.cuboid(SHIPWRECK.halfBeam, 2.5, SHIPWRECK.halfLength)
      .setTranslation(c.x + SHIPWRECK.x, c.y + 2, c.z + SHIPWRECK.z).setRotation(yawQ(SHIPWRECK.yaw)));
  }

  /** Static colliders: the hero rock, boulders and tree trunks. */
  private addRocks(): void {
    const hull = this.R.ColliderDesc.convexHull(heroRockHullPoints());
    if (hull) this.world.createCollider(hull);
    for (const rock of MEADOW_ROCKS) {
      const radius = rockColliderRadius(rock);
      const desc = this.R.ColliderDesc.ball(radius).setTranslation(rock.position.x, rock.position.y, rock.position.z);
      this.world.createCollider(desc);
    }
    // Tree trunks (the canopies are high enough to walk under).
    for (const tree of MEADOW_TREES) {
      const halfHeight = 1.6 * tree.scale;
      const desc = this.R.ColliderDesc.cylinder(halfHeight, trunkRadius(tree)).setTranslation(tree.x, tree.y + halfHeight, tree.z);
      this.world.createCollider(desc);
    }
  }

  /** Creates, moves or removes kinematic bodies so they match the world's entities. */
  syncFrom(state: WorldState): void {
    if (state.flags.barricadeBroken && this.barricade) {
      this.world.removeCollider(this.barricade, false);
      this.barricade = null;
    }
    if (this.keepDoor) this.keepDoor.setEnabled(!state.flags.keepDoorOpen);
    this.bridgeDeck?.setEnabled(!!state.flags.villageBridgeUp);
    this.bridgeBarrier?.setEnabled(!state.flags.villageBridgeUp);
    for (const [id, record] of this.bodies) {
      if (!state.entities[id]) {
        for (let i = 0; i < record.body.numColliders(); i += 1) this.cameraBlockers.delete(record.body.collider(i).handle);
        this.world.removeRigidBody(record.body);
        this.bodies.delete(id);
      }
    }
    for (const entity of Object.values(state.entities)) {
      if (entity.mech) {
        // Cerberus Mk. II: a big box that walks and turns (M7).
        let record = this.bodies.get(entity.id);
        if (!record) {
          const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
          const collider = this.world.createCollider(this.R.ColliderDesc.cuboid(MECH_SIZE.halfX, MECH_SIZE.halfY, MECH_SIZE.halfZ), body);
          record = { body, collider, centerOffset: MECH_SIZE.halfY };
          this.cameraBlockers.add(collider.handle);
          this.bodies.set(entity.id, record);
        }
        const p = entity.position;
        record.body.setTranslation({ x: p.x, y: p.y + record.centerOffset, z: p.z }, false);
        record.body.setRotation({ x: 0, y: Math.sin(entity.rotationY / 2), z: 0, w: Math.cos(entity.rotationY / 2) }, false);
        continue;
      }
      if (entity.kraken) {
        // The Kraken mech (Nov 16): a squat drum that turns where it stands.
        let record = this.bodies.get(entity.id);
        if (!record) {
          const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
          const collider = this.world.createCollider(this.R.ColliderDesc.cylinder(KRAKEN_MECH_SIZE.height / 2, KRAKEN_MECH_SIZE.radius), body);
          record = { body, collider, centerOffset: KRAKEN_MECH_SIZE.height / 2 };
          this.cameraBlockers.add(collider.handle);
          // Its dome and core seat stand well above the drum: a camera-only ball (a sensor: nothing bumps into it).
          const dome = this.world.createCollider(this.R.ColliderDesc.ball(5).setSensor(true).setTranslation(0, 4.6 - KRAKEN_MECH_SIZE.height / 2, 0), body);
          this.cameraBlockers.add(dome.handle);
          this.bodies.set(entity.id, record);
        }
        const p = entity.position;
        record.body.setTranslation({ x: p.x, y: p.y + record.centerOffset, z: p.z }, false);
        continue;
      }
      // The Kraken mech's back plating rides inside its drum: hittable, but no body of its own.
      if (entity.mechPart?.part === 'back-plating') continue;
      // The keep's door is a structure, but the door collider above blocks the doorway.
      if (entity.structure?.kind === 'keep-door') continue;
      if (!entity.body || !(entity.hero || entity.creature || entity.structure || entity.npc)) continue;
      let record = this.bodies.get(entity.id);
      if (!record) {
        const { radius, height } = entity.body;
        const halfHeight = Math.max(0.05, height / 2 - radius);
        const body = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased());
        const collider = this.world.createCollider(this.R.ColliderDesc.capsule(halfHeight, radius), body);
        record = { body, collider, centerOffset: height / 2 };
        this.bodies.set(entity.id, record);
      }
      const p = entity.position;
      record.body.setTranslation({ x: p.x, y: p.y + record.centerOffset, z: p.z }, false);
    }
  }

  /** Updates the collision queries after a sync. */
  step(): void {
    this.world.step();
  }

  /**
   * How far a camera can sit from `from` toward `to` before something solid
   * (a wall, pillar, tower…) is in the way, or null if the line is clear.
   * Characters (kinematic bodies) don't block it; the mechs do.
   */
  cameraClearance(from: Vec3, to: Vec3): number | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-3) return null;
    const ray = new this.R.Ray(from, { x: dx / length, y: dy / length, z: dz / length });
    const hit = this.world.castRay(ray, length, true, undefined, undefined, undefined, undefined,
      (collider) => this.cameraBlockers.has(collider.handle) || (!collider.isSensor() && !collider.parent()?.isKinematic()));
    return hit ? hit.timeOfImpact : null;
  }

  /**
   * Moves a character by `delta` (metres), sliding along walls and stepping
   * up small ledges. Returns the new feet position and whether it's grounded.
   */
  moveCharacter(id: EntityId, delta: Vec3): MoveResult | undefined {
    const record = this.bodies.get(id);
    if (!record) return undefined;
    this.controller.computeColliderMovement(record.collider, delta);
    const move = this.controller.computedMovement();
    const current = record.body.translation();
    const next = { x: current.x + move.x, y: current.y + move.y, z: current.z + move.z };
    record.body.setTranslation(next, false);
    // Keep later characters this tick colliding with the new position.
    record.collider.setTranslation(next);
    return {
      position: { x: next.x, y: next.y - record.centerOffset, z: next.z },
      grounded: this.controller.computedGrounded(),
    };
  }

  /** Height of the first surface below (x, y, z), for tests and spawning. */
  groundBelow(x: number, y: number, z: number): number | undefined {
    const hit = this.world.castRay(new this.R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), 500, true, this.R.QueryFilterFlags.EXCLUDE_SENSORS);
    return hit ? y - hit.timeOfImpact : undefined;
  }

  free(): void {
    this.controller.free();
    this.world.free();
    this.bodies.clear();
  }
}
