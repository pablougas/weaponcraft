import * as THREE from 'three';
import { enemies } from '../content/enemies';
import { gods } from '../content/gods';
import { regionOf, type RegionId } from '../sim/regions';
import { restPose } from '../sim/systems/rest';
import { structures } from '../content/structures';
import { mechs } from '../content/mechs';
import type { ModelLoader } from '../content/types';
import type { Entity, EntityId, GameEvent, WorldState } from '../sim';
import type { EntityModel, Expression, ModelFactory, ModelFrame } from './entity-model';
import type { Interpolator } from './interpolation';
import type { Look } from './look';
import { createPickupModel } from './pickup-model';
import { createDecoyModel } from './effects/shadow';

/** Every approved def that has a model, by def ID. */
function modelLoaders(): Map<string, ModelLoader> {
  const loaders = new Map<string, ModelLoader>();
  for (const def of [...gods, ...enemies, ...structures, ...mechs]) {
    if (def.approved) loaders.set(def.id, def.model);
  }
  return loaders;
}

/** Loads every approved model module up front (during the loading screen). */
export async function preloadModels(): Promise<Map<string, ModelFactory>> {
  const factories = new Map<string, ModelFactory>();
  await Promise.all([...modelLoaders()].map(async ([id, load]) => {
    factories.set(id, (await load()).createModel);
  }));
  // Weapons lying in the world use one built-in model that shows whichever weapon it is.
  factories.set('weapon-pickup', createPickupModel);
  // Arrows in flight (M6): a shaft with a bronze head, pointing where it flies.
  factories.set('arrow', (look) => {
    const root = new THREE.Group();
    root.add(look.M(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 5), look.toon({ color: '#6a4a33' }), [0, 0, 0], { rot: [Math.PI / 2, 0, 0], outline: false }));
    root.add(look.M(new THREE.ConeGeometry(0.04, 0.14, 5), look.toon({ color: '#b08a42' }), [0, 0, 0.45], { rot: [Math.PI / 2, 0, 0], outline: false }));
    return { root, update() {} };
  });
  // Shadow Step's decoy (M6).
  factories.set('shadow-decoy', () => {
    const decoy = createDecoyModel();
    return { root: decoy.root, update: (entity) => decoy.update(entity) };
  });
  return factories;
}

/**
 * Keeps one model per entity in the scene, placed at its interpolated
 * position and heading. Entities without a model (e.g. dev markers) are skipped.
 */
export class EntityViews {
  private readonly models = new Map<EntityId, { model: EntityModel; defId: string }>();
  private faceOverride: Expression | null = null;
  private readonly position = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly look: Look,
    private readonly factories: Map<string, ModelFactory>,
  ) {}

  sync(world: WorldState, interpolator: Interpolator, alpha: number, frame: ModelFrame, region: RegionId = 'surface'): void {
    for (const [id, entry] of this.models) {
      const entity = world.entities[id];
      if (!entity || entity.defId !== entry.defId) this.remove(id);
    }
    for (const entity of Object.values(world.entities)) {
      let entry = this.models.get(entity.id);
      if (!entry) {
        const factory = this.factories.get(entity.defId);
        if (!factory) continue;
        const model = factory(this.look, entity.id);
        if (this.faceOverride && model.setExpression) model.setExpression(this.faceOverride);
        this.scene.add(model.root);
        entry = { model, defId: entity.defId };
        this.models.set(entity.id, entry);
      }
      // Only the local god's region is drawn: the surface and the Underworld never mix.
      entry.model.root.visible = regionOf(entity) === region;
      if (!entry.model.root.visible) continue;
      const p = interpolator.position(world, entity.id, alpha, this.position)!;
      const root = entry.model.root;
      root.position.set(p.x, p.y, p.z);
      root.rotation.y = interpolator.rotation(world, entity.id, alpha) ?? entity.rotationY;
      entry.model.update(entity, frame);
      if (entity.hero) this.poseResting(world, entity, root);
    }
  }

  /** Lying on a bed (or fallen): tip the model onto its back, on the mattress. */
  private poseResting(world: WorldState, entity: Entity, root: THREE.Object3D): void {
    const pose = restPose(entity.hero);
    root.rotation.order = 'YXZ';
    root.rotation.x = -Math.PI / 2 * pose.lay;
    if (pose.lay <= 0) return;
    const bed = entity.hero?.rest ? world.entities[entity.hero.rest.bedId] : undefined;
    if (pose.onBed && bed) {
      // Feet at the foot of the mattress, head on the pillow.
      const yaw = bed.rotationY;
      const lie = new THREE.Vector3(Math.sin(yaw) * 1.3, 0.86, Math.cos(yaw) * 1.3).add(new THREE.Vector3(bed.position.x, bed.position.y, bed.position.z));
      root.position.lerp(lie, Math.min(1, pose.lay * 1.4));
      root.rotation.y = yaw;
    } else {
      root.position.y += 0.25 * pose.lay;
    }
  }

  handleEvent(event: GameEvent, frame: ModelFrame): void {
    for (const { model } of this.models.values()) model.onEvent?.(event, frame);
  }

  /** Forces every face to `expression` (tests); null returns to automatic faces. */
  setFaceOverride(expression: Expression | null): void {
    this.faceOverride = expression;
    for (const { model } of this.models.values()) model.setExpression?.(expression);
  }

  anchor(entityId: EntityId, name: 'spearTip', out: THREE.Vector3): THREE.Vector3 | undefined {
    return this.models.get(entityId)?.model.anchor?.(name, out);
  }

  /** Drops every model (new game). */
  clear(): void {
    for (const id of [...this.models.keys()]) this.remove(id);
  }

  private remove(id: EntityId): void {
    const entry = this.models.get(id);
    if (!entry) return;
    this.scene.remove(entry.model.root);
    entry.model.dispose?.();
    this.models.delete(id);
  }
}
