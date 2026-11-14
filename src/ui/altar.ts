import type { GameEvent } from '../sim/events';
import { isKnownWeapon, pairKey, weaponData } from '../sim/weapons';
import type { Screen, ScreenDeps } from './inventory';
import { escapeHtml, weaponDetailHtml } from './weapon-card';
import { weaponIconSvg } from './weapon-icon';

export interface AltarScreen extends Screen {
  /** Shows the fusion result when the sim reports it. */
  handleEvent(event: GameEvent): void;
}

/**
 * The Fusion Altar (F at the altar): pick weapon A, then weapon B, see what's
 * known about the pair, and fuse. Unknown pairs make a weapon with A's shape
 * and B's element (SPEC §8).
 */
export function createAltarScreen(parent: HTMLElement, deps: ScreenDeps): AltarScreen {
  const element = document.createElement('div');
  element.id = 'wc-altar';
  element.className = 'wc-modal';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'wc-altar-title');
  parent.append(element);
  let slotA: number | null = null;
  let slotB: number | null = null;
  let result: { id: string; legendary: boolean; newDiscovery: boolean } | null = null;
  let rendered = '';

  const render = () => {
    const world = deps.getWorld();
    const items = (world.players[deps.playerId]?.inventory ?? []).filter((id) => isKnownWeapon(world, id));
    if (slotA !== null && slotA >= items.length) slotA = null;
    if (slotB !== null && slotB >= items.length) slotB = null;
    const signature = JSON.stringify([items, slotA, slotB, result, Object.keys(world.codex).length]);
    if (signature === rendered) return;
    rendered = signature;

    if (result) {
      const weapon = weaponData(world, result.id);
      const headline = result.legendary
        ? (result.newDiscovery ? 'A legendary weapon is born!' : 'Legendary forged')
        : (result.newDiscovery ? 'New fusion discovered' : 'Fusion complete');
      element.innerHTML = `
        <div class="wc-panel">
          <header class="wc-modal-head"><h2 id="wc-altar-title">${headline}</h2><button type="button" class="wc-close" data-action="close" aria-label="Close">×</button></header>
          <div class="wc-reveal${result.legendary ? ' wc-reveal-legendary' : ''}">${weaponDetailHtml(weapon)}</div>
          <div class="wc-actions">
            <button type="button" class="wc-primary" data-action="again">Fuse again</button>
            <button type="button" data-action="close">Done</button>
          </div>
          ${result.newDiscovery ? `<p class="wc-hint">Added to the Fusion Codex (${escapeHtml(deps.keyFor('codex'))}).</p>` : ''}
        </div>`;
      return;
    }

    const pick = (slot: number | null, label: string) => {
      if (slot === null) return `<div class="wc-fuse-slot wc-slot-empty"><span>${label}</span></div>`;
      const weapon = weaponData(world, items[slot]);
      return `<div class="wc-fuse-slot"><span>${label}</span>${weaponIconSvg(weapon, 64)}<strong>${escapeHtml(weapon.name)}</strong></div>`;
    };
    let preview = 'Choose two weapons.';
    if (slotA !== null && slotB !== null) {
      const a = items[slotA];
      const b = items[slotB];
      const known = world.codex[pairKey(a, b)] ?? world.codex[`fused:${a}|${b}`];
      preview = known
        ? `Known fusion: <strong>${escapeHtml(weaponData(world, known.resultId).name)}</strong>`
        : 'Unknown result. If no legend answers, the new weapon takes A’s shape and B’s element.';
    }
    const list = items.map((id, i) => {
      const weapon = weaponData(world, id);
      const role = i === slotA ? 'A' : i === slotB ? 'B' : '';
      return `<button type="button" class="wc-slot${role ? ' wc-selected' : ''}" data-slot="${i}" aria-label="${escapeHtml(weapon.name)}${role ? ` (${role})` : ''}">
        ${weaponIconSvg(weapon, 52)}${role ? `<span class="wc-badge">${role}</span>` : ''}</button>`;
    }).join('');
    element.innerHTML = `
      <div class="wc-panel wc-panel-wide">
        <header class="wc-modal-head"><h2 id="wc-altar-title">Fusion Altar</h2><button type="button" class="wc-close" data-action="close" aria-label="Close">×</button></header>
        <div class="wc-fuse-row">
          ${pick(slotA, 'A · shape')}
          <span class="wc-fuse-plus" aria-hidden="true">+</span>
          ${pick(slotB, 'B · element')}
        </div>
        <p class="wc-fuse-preview" aria-live="polite">${preview}</p>
        <div class="wc-slots wc-slots-row" role="group" aria-label="Your weapons">${list}</div>
        <div class="wc-actions">
          <button type="button" class="wc-primary" data-action="fuse" ${slotA !== null && slotB !== null ? '' : 'disabled'}>Fuse</button>
          <button type="button" data-action="clear">Clear</button>
        </div>
        <p class="wc-hint">Both weapons are used up. Each legendary has its own pair to find.</p>
      </div>`;
  };

  element.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-slot],[data-action]');
    if (!button || (button as HTMLButtonElement).disabled) return;
    const slot = button.dataset.slot;
    if (slot !== undefined) {
      const i = Number(slot);
      if (i === slotA) slotA = null;
      else if (i === slotB) slotB = null;
      else if (slotA === null) slotA = i;
      else slotB = i;
    } else {
      switch (button.dataset.action) {
        case 'fuse':
          if (slotA !== null && slotB !== null) deps.send({ type: 'player:fuse', slotA, slotB });
          break;
        case 'clear':
          slotA = null;
          slotB = null;
          break;
        case 'again':
          result = null;
          slotA = null;
          slotB = null;
          break;
        case 'close':
          screen.close();
          return;
        default:
      }
    }
    render();
  });

  const screen: AltarScreen = {
    element,
    get isOpen() {
      return !element.hidden;
    },
    open() {
      slotA = null;
      slotB = null;
      result = null;
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
    handleEvent(event) {
      if (event.type !== 'fusion:created' || event.playerId !== deps.playerId) return;
      result = { id: event.resultId, legendary: event.legendary, newDiscovery: event.newDiscovery };
      slotA = null;
      slotB = null;
      render();
    },
  };
  return screen;
}
