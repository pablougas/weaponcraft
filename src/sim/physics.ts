import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { meadowHeightAt } from './terrain/meadow';
import { GROTTO_SPOTS } from './cutscenes/descent';
import { GROTTO } from './regions';
import { CERBERUS_POST, FIELDS, FIELDS_CELL, FORT_SPOTS, GATE_PILLARS, MECH_FOOTPRINT, palisadeSegments, spireBase, SPIRES, TUNNEL, underworldLocalHeight, watchtowerSpot } from './terrain/underworld';
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

  constructor(private readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    this.addTerrain();
    this.addRocks();
    this.addGrotto();
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
    // Spires, the Gates' pillars, the Mk. II's footprint and Cerberus's chain post.
    for (const spire of SPIRES) {
      this.world.createCollider(R.ColliderDesc.cylinder(spire.height / 2, spire.radius * 0.8).setTranslation(c.x + spire.x, c.y + spireBase(spire) + spire.height / 2, c.z + spire.z));
    }
    for (const pillar of GATE_PILLARS) this.world.createCollider(R.ColliderDesc.cylinder(15, 3.2).setTranslation(c.x + pillar.x, c.y + 14, c.z + pillar.z));
    const mech = MECH_FOOTPRINT;
    this.world.createCollider(R.ColliderDesc.cuboid(mech.halfX, 6, mech.halfZ).setTranslation(c.x + mech.x, c.y + 6, c.z + mech.z));
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
    for (const [id, record] of this.bodies) {
      if (!state.entities[id]) {
        this.world.removeRigidBody(record.body);
        this.bodies.delete(id);
      }
    }
    for (const entity of Object.values(state.entities)) {
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
    const hit = this.world.castRay(new this.R.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), 500, true);
    return hit ? y - hit.timeOfImpact : undefined;
  }

  free(): void {
    this.controller.free();
    this.world.free();
    this.bodies.clear();
  }
}
