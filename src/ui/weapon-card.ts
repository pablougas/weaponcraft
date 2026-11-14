import { ARCHETYPES } from '../content/weapons/build';
import { MATERIALS } from '../content/weapons/materials';
import { ELEMENT_INFO } from '../sim/elements';
import type { WeaponData } from '../sim/types';
import { weaponIconSvg } from './weapon-icon';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** An element chip: name in the element's colour with its status effect. */
export function elementChip(weapon: WeaponData): string {
  if (!weapon.element) return '<span class="wc-chip">No element</span>';
  const info = ELEMENT_INFO[weapon.element];
  return `<span class="wc-chip wc-chip-element" style="--chip:${info.text}">${info.name} · ${info.status}</span>`;
}

/** Name, icon, element, material, damage and description of a weapon. */
export function weaponDetailHtml(weapon: WeaponData): string {
  return `
    <div class="wc-weapon-detail">
      <div class="wc-weapon-detail-head">
        <span class="wc-weapon-detail-icon">${weaponIconSvg(weapon, 72)}</span>
        <div>
          <h3>${escapeHtml(weapon.name)}</h3>
          <div class="wc-chips">
            ${weapon.legendary ? '<span class="wc-chip wc-chip-legendary">Legendary</span>' : ''}
            ${elementChip(weapon)}
          </div>
        </div>
      </div>
      <dl class="wc-stats">
        <dt>Type</dt><dd>${ARCHETYPES[weapon.archetype].name} · ${MATERIALS[weapon.material].name}</dd>
        <dt>Light / heavy</dt><dd>${weapon.light.damage} / ${weapon.heavy.damage} damage</dd>
        <dt>Reach</dt><dd>${weapon.light.range} m</dd>
      </dl>
      <p class="wc-weapon-desc">${escapeHtml(weapon.description)}</p>
    </div>`;
}
