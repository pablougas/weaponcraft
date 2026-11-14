import type * as THREE from 'three';
import type { Entity, EntityId, GameEvent, WorldState } from '../sim';
import type { Look } from './look';

/** The four swappable faces (SPEC §14). */
export type Expression = 'neutral' | 'determined' | 'happy' | 'hurt';
export const EXPRESSIONS: readonly Expression[] = ['neutral', 'determined', 'happy', 'hurt'];

/** What a model needs each frame. */
export interface ModelFrame {
  /** View clock, seconds (frozen in tests). */
  time: number;
  /** Seconds since the previous frame (0 when frozen). */
  dt: number;
  world: WorldState;
  reduceMotion: boolean;
}

/**
 * A 3D model for one entity. The view places `root` at the entity's
 * interpolated position and heading; `update` animates the rest from state.
 * Models only read sim state; they never change it.
 */
export interface EntityModel {
  root: THREE.Object3D;
  update(entity: Entity, frame: ModelFrame): void;
  /** Reacts to sim events (hits, casts…) for one-off animation. */
  onEvent?(event: GameEvent, frame: ModelFrame): void;
  /** Forces a face (tests, cutscenes); null returns to the automatic one. */
  setExpression?(expression: Expression | null): void;
  /** World position of a named attachment point, e.g. the spear tip. */
  anchor?(name: 'spearTip', out: THREE.Vector3): THREE.Vector3 | undefined;
  dispose?(): void;
}

export type ModelFactory = (look: Look, entityId: EntityId) => EntityModel;
