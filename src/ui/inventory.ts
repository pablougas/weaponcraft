import type { IntentInput } from '../sim/intents';
import { INVENTORY_SLOTS } from '../sim/systems/items';
import type { PlayerId, WorldState } from '../sim/types';
import { isKnownWeapon, weaponData } from '../sim/weapons';
import { escapeHtml, weaponDetailHtml } from './weapon-card';
import { weaponIconSvg } from './weapon-icon';

export interface ScreenDeps {
  getWorld(): WorldState;
  playerId: PlayerId;
  send(intent: IntentInput): void;
  /** Key labels for hints, e.g. keyFor('inventory') → "I". */
  keyFor(action: 'inventory' | 'codex' | 'interact'): string;
}

export interface Screen {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Re-renders if what it shows changed (cheap; call every frame while open). */
  refresh(): void;
}

/** The inventory (I): carried weapons as icons; pick one to see it and equip it. */
export function createInventory(parent: HTMLElement, deps: ScreenDeps): Screen {
  const element = document.createElement('div');
  element.id = 'wc-inventory';
  element.className = 'wc-modal';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'wc-inventory-title');
  parent.append(element);
  let selected = 0;
  let rendered = '';

  const render = () => {
    const world = deps.getWorld();
    const player = world.players[deps.playerId];
    const hero = player?.entityId ? world.entities[player.entityId] : undefined;
    const equipped = hero?.hero?.weaponId;
    const items = (player?.inventory ?? []).filter((id) => isKnownWeapon(world, id));
    selected = Math.min(selected, Math.max(0, items.length - 1));
    const signature = JSON.stringify([items, equipped, selected]);
    if (signature === rendered) return;
    rendered = signature;
    const slots = Array.from({ length: INVENTORY_SLOTS }, (_, i) => {
      const id = items[i];
      if (!id) return '<div class="wc-slot wc-slot-empty" aria-hidden="true"></div>';
      const weapon = weaponData(world, id);
      const isEquipped = id === equipped && items.indexOf(id) === i;
      return `<button type="button" class="wc-slot${i === selected ? ' wc-selected' : ''}${weapon.legendary ? ' wc-slot-legendary' : ''}" data-slot="${i}"
        aria-pressed="${i === selected}" aria-label="${escapeHtml(weapon.name)}${isEquipped ? ' (equipped)' : ''}">
        ${weaponIconSvg(weapon, 52)}${isEquipped ? '<span class="wc-badge">Equipped</span>' : ''}</button>`;
    }).join('');
    const current = items[selected] ? weaponData(world, items[selected]) : undefined;
    const isEquipped = current && current.id === equipped;
    element.innerHTML = `
      <div class="wc-panel wc-panel-wide">
        <header class="wc-modal-head"><h2 id="wc-inventory-title">Inventory</h2><button type="button" class="wc-close" data-action="close" aria-label="Close">×</button></header>
        <div class="wc-split">
          <div class="wc-slots" role="group" aria-label="Weapons">${slots}</div>
          <div class="wc-side">
            ${current ? weaponDetailHtml(current) : '<p class="wc-empty">No weapons.</p>'}
            ${current ? `<button type="button" class="wc-primary" data-action="equip" ${isEquipped ? 'disabled' : ''}>${isEquipped ? 'Equipped' : 'Equip'}</button>` : ''}
          </div>
        </div>
        <p class="wc-hint">${items.length} / ${INVENTORY_SLOTS} weapons · Find more in the meadow (${escapeHtml(deps.keyFor('interact'))} to pick up) · Fuse two at the Fusion Altar · ${escapeHtml(deps.keyFor('inventory'))} to close</p>
      </div>`;
  };

  element.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-slot],[data-action]');
    if (!button) return;
    if (button.dataset.slot !== undefined) {
      selected = Number(button.dataset.slot);
      render();
    } else if (button.dataset.action === 'equip') {
      deps.send({ type: 'player:equip', slot: selected });
    } else if (button.dataset.action === 'close') {
      screen.close();
    }
  });

  const screen: Screen = {
    element,
    get isOpen() {
      return !element.hidden;
    },
    open() {
      rendered = '';
      render();
      element.hidden = false;
      element.querySelector<HTMLElement>('.wc-slot')?.focus();
    },
    close() {
      element.hidden = true;
    },
    refresh() {
      if (!element.hidden) render();
    },
  };
  return screen;
}
