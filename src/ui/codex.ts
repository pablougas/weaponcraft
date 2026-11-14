import { FUSIONS, weapons } from '../content/weapons';
import { isKnownWeapon, pairKey, weaponData } from '../sim/weapons';
import type { Screen, ScreenDeps } from './inventory';
import { escapeHtml } from './weapon-card';
import { weaponIconSvg } from './weapon-icon';

/**
 * The Fusion Codex (C): every legendary as a card, hidden until discovered,
 * plus every other fusion found in this world. The main sandbox goal (SPEC §8).
 */
export function createCodex(parent: HTMLElement, deps: ScreenDeps): Screen {
  const element = document.createElement('div');
  element.id = 'wc-codex';
  element.className = 'wc-modal';
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'wc-codex-title');
  parent.append(element);
  let rendered = '';

  const name = (id: string) => (isKnownWeapon(deps.getWorld(), id) ? weaponData(deps.getWorld(), id).name : id);

  const render = () => {
    const world = deps.getWorld();
    const signature = JSON.stringify(Object.keys(world.codex));
    if (signature === rendered) return;
    rendered = signature;
    const legendaryIds = weapons.filter((w) => w.legendary).map((w) => w.id);
    const found = legendaryIds.filter((id) => Object.values(world.codex).some((e) => e.resultId === id));
    const cards = legendaryIds.map((id) => {
      const recipe = FUSIONS.find((r) => r.result === id);
      const entry = recipe ? world.codex[pairKey(recipe.a, recipe.b)] : undefined;
      if (!entry) {
        return `<li class="wc-codex-card wc-locked"><span class="wc-codex-icon" aria-hidden="true">?</span><strong>Undiscovered</strong><span>A legendary waits for the right pair.</span></li>`;
      }
      const weapon = weaponData(world, id);
      return `<li class="wc-codex-card">${weaponIconSvg(weapon, 64)}<strong>${escapeHtml(weapon.name)}</strong>
        <span>${escapeHtml(name(entry.inputs[0]))} + ${escapeHtml(name(entry.inputs[1]))}</span></li>`;
    }).join('');
    const others = Object.values(world.codex).filter((e) => !e.legendary);
    const otherList = others.length
      ? others.map((e) => {
        const weapon = weaponData(world, e.resultId);
        return `<li>${weaponIconSvg(weapon, 36)}<span><strong>${escapeHtml(weapon.name)}</strong> · ${escapeHtml(name(e.inputs[0]))} + ${escapeHtml(name(e.inputs[1]))}</span></li>`;
      }).join('')
      : '<li class="wc-empty">None yet. Any pair you fuse is recorded here.</li>';
    element.innerHTML = `
      <div class="wc-panel wc-panel-wide">
        <header class="wc-modal-head"><h2 id="wc-codex-title">Fusion Codex</h2><button type="button" class="wc-close" data-action="close" aria-label="Close">×</button></header>
        <p class="wc-codex-progress"><strong>${found.length} / ${legendaryIds.length}</strong> legendaries discovered</p>
        <ul class="wc-codex-grid">${cards}</ul>
        <h3 class="wc-subhead">Other fusions</h3>
        <ul class="wc-codex-list">${otherList}</ul>
        <p class="wc-hint">${escapeHtml(deps.keyFor('codex'))} to close</p>
      </div>`;
  };

  element.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-action="close"]')) screen.close();
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
      element.querySelector<HTMLElement>('.wc-close')?.focus();
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
