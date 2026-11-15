import * as THREE from 'three';
import { ELEMENT_INFO } from '../sim/elements';
import type { GameEvent } from '../sim/events';
import { nearestInteractable } from '../sim/systems/items';
import type { EntityId, PlayerId, WorldState } from '../sim/types';
import { isKnownWeapon, weaponData } from '../sim/weapons';

const NUMBER_SECONDS = 0.9;
const STATUS_LABELS = { poison: 'Poisoned', blind: 'Blinded', stun: 'Stunned', crush: 'Caged' } as const;
const STATUS_COLORS = { poison: ELEMENT_INFO.poison.color, blind: ELEMENT_INFO.light.color, stun: ELEMENT_INFO.lightning.color, crush: ELEMENT_INFO.shadow.color } as const;

interface FloatingNumber {
  el: HTMLElement;
  at: THREE.Vector3;
  age: number;
}

/**
 * Labels drawn over the 3D view: damage numbers (gold with "Weak!" when the
 * element wheel doubles a hit), status chips over affected creatures, and the
 * F prompt on the right of the screen when something is in reach. Reads state only.
 */
export class WorldLabels {
  readonly element: HTMLElement;
  private readonly numbers: FloatingNumber[] = [];
  private readonly statusEls = new Map<EntityId, HTMLElement>();
  private readonly prompt: HTMLElement;
  private readonly projected = new THREE.Vector3();

  constructor(parent: HTMLElement, private readonly interactKey: () => string) {
    this.element = document.createElement('div');
    this.element.id = 'wc-labels';
    this.element.setAttribute('aria-hidden', 'true');
    this.prompt = document.createElement('div');
    this.prompt.className = 'wc-prompt';
    this.prompt.hidden = true;
    this.element.append(this.prompt);
    parent.append(this.element);
  }

  handleEvent(event: GameEvent, world: WorldState, isLocal: (id: EntityId | null) => boolean): void {
    if (event.type !== 'combat:hit' || event.amount <= 0) return;
    if (!isLocal(event.attackerId) && event.kind !== 'status') return;
    const target = world.entities[event.targetId];
    if (!target) return;
    const el = document.createElement('div');
    const superEffective = (event.multiplier ?? 1) >= 2;
    el.className = `wc-damage${superEffective ? ' wc-super' : ''}`;
    el.textContent = String(event.amount);
    if (superEffective) {
      const note = document.createElement('small');
      note.textContent = 'Weak!';
      el.append(note);
    }
    if (event.element) el.style.color = superEffective ? '' : ELEMENT_INFO[event.element].text;
    this.element.append(el);
    const height = (target.body?.height ?? 1.6) + 0.3;
    // A small sideways offset per tick so simultaneous hits don't overlap.
    const offset = ((event.tick * 7) % 5 - 2) * 0.15;
    this.numbers.push({ el, at: new THREE.Vector3(target.position.x + offset, target.position.y + height, target.position.z), age: 0 });
  }

  update(world: WorldState, camera: THREE.Camera, playerId: PlayerId, dt: number, reduceMotion: boolean, visible: boolean): void {
    this.element.hidden = !visible;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const place = (el: HTMLElement, point: THREE.Vector3): boolean => {
      this.projected.copy(point).project(camera);
      const onScreen = this.projected.z < 1 && Math.abs(this.projected.x) < 1.1 && Math.abs(this.projected.y) < 1.1;
      el.style.display = onScreen ? '' : 'none';
      el.style.left = `${(this.projected.x * 0.5 + 0.5) * width}px`;
      el.style.top = `${(-this.projected.y * 0.5 + 0.5) * height}px`;
      return onScreen;
    };

    for (let i = this.numbers.length - 1; i >= 0; i -= 1) {
      const n = this.numbers[i];
      n.age += dt;
      const t = n.age / NUMBER_SECONDS;
      if (!reduceMotion) n.at.y += dt * 0.9;
      n.el.style.opacity = String(Math.max(0, 1 - t * t));
      place(n.el, n.at);
      if (t >= 1) {
        n.el.remove();
        this.numbers.splice(i, 1);
      }
    }

    // Status chips over affected creatures.
    const seen = new Set<EntityId>();
    for (const entity of Object.values(world.entities)) {
      const status = entity.statuses?.find((s) => s.ticksLeft > 0);
      if (!status) continue;
      seen.add(entity.id);
      let el = this.statusEls.get(entity.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'wc-status';
        this.element.append(el);
        this.statusEls.set(entity.id, el);
      }
      el.textContent = STATUS_LABELS[status.kind];
      el.style.setProperty('--chip', STATUS_COLORS[status.kind]);
      place(el, this.projected.set(entity.position.x, entity.position.y + (entity.body?.height ?? 1.6) + 0.25, entity.position.z).clone());
    }
    for (const [id, el] of this.statusEls) {
      if (!seen.has(id)) {
        el.remove();
        this.statusEls.delete(id);
      }
    }

    // "F  Pick up …" / "F  Use Fusion Altar" next to the nearest thing in reach.
    const target = nearestInteractable(world, playerId);
    if (!target) {
      this.prompt.hidden = true;
      return;
    }
    let label = 'Use';
    if (target.pickup && isKnownWeapon(world, target.pickup.weaponId)) label = `Pick up ${weaponData(world, target.pickup.weaponId).name}`;
    if (target.structure?.kind === 'fusion-altar') label = 'Use Fusion Altar';
    if (target.structure?.kind === 'bed') label = 'Rest';
    if (target.structure?.kind === 'forge') label = 'Use the Forge';
    if (target.structure?.kind === 'dispatch') label = 'Read the dispatch';
    if (target.structure?.kind === 'barricade') label = 'Examine the barricade';
    if (target.structure?.kind === 'chest') label = 'Open the chest';
    if (target.structure?.kind === 'chains') label = world.flags.wardenDefeated && !world.flags.cerberusFreed ? 'Break Cerberus\u2019s chains' : 'Examine the chains';
    if (target.npc) label = `Talk to ${target.npc.name}`;
    this.prompt.hidden = false;
    this.prompt.innerHTML = '';
    const key = document.createElement('kbd');
    key.textContent = this.interactKey();
    this.prompt.append(key, document.createTextNode(label));
    // Fixed on the right of the screen (not over the object, which sits mid-screen behind the god).
  }

  clear(): void {
    for (const n of this.numbers) n.el.remove();
    this.numbers.length = 0;
    for (const el of this.statusEls.values()) el.remove();
    this.statusEls.clear();
    this.prompt.hidden = true;
  }
}
