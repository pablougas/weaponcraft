import * as THREE from 'three';
import { enemies } from '../content/enemies';
import { gods } from '../content/gods';
import { structures } from '../content/structures';
import type { ModelLoader } from '../content/types';
import type { EntityId, GameEvent, WorldState } from '../sim';
import type { EntityModel, Expression, ModelFactory, ModelFrame } from './entity-model';
import type { Interpolator } from './interpolation';
import type { Look } from './look';
import { createPickupModel } from './pickup-model';

/** Every approved def that has a model, by def ID. */
function modelLoaders(): Map<string, ModelLoader> {
  const loaders = new Map<string, ModelLoader>();
  for (const def of [...gods, ...enemies, ...structures]) {
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

  sync(world: WorldState, interpolator: Interpolator, alpha: number, frame: ModelFrame): void {
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
      const p = interpolator.position(world, entity.id, alpha, this.position)!;
      entry.model.root.position.set(p.x, p.y, p.z);
      entry.model.root.rotation.y = interpolator.rotation(world, entity.id, alpha) ?? entity.rotationY;
      entry.model.update(entity, frame);
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
