import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { meadowHeightAt } from './terrain/meadow';
import { heroRockHullPoints, MEADOW_ROCKS } from './terrain/meadow-rocks';
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

  constructor(private readonly R: Rapier) {
    this.world = new R.World({ x: 0, y: 0, z: 0 });
    this.addTerrain();
    this.addRocks();
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

  private addRocks(): void {
    const hull = this.R.ColliderDesc.convexHull(heroRockHullPoints());
    if (hull) this.world.createCollider(hull);
    for (const rock of MEADOW_ROCKS) {
      // Boulders as squashed balls: close enough for bumping into.
      const radius = Math.min(rock.scale.x, rock.scale.z) * 0.9;
      const desc = this.R.ColliderDesc.ball(radius).setTranslation(rock.position.x, rock.position.y, rock.position.z);
      this.world.createCollider(desc);
    }
  }

  /** Creates, moves or removes kinematic bodies so they match the world's entities. */
  syncFrom(state: WorldState): void {
    for (const [id, record] of this.bodies) {
      if (!state.entities[id]) {
        this.world.removeRigidBody(record.body);
        this.bodies.delete(id);
      }
    }
    for (const entity of Object.values(state.entities)) {
      if (!entity.body || !(entity.hero || entity.creature)) continue;
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
