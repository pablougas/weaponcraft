import { MATERIALS } from '../content/weapons/materials';
import { ELEMENT_INFO } from '../sim/elements';
import type { WeaponData } from '../sim/types';

/**
 * An SVG icon generated from a weapon's parts, material and element (SPEC
 * §8), so fused weapons get icons too. The weapon is drawn upright on a
 * 100×100 grid, then turned 45°. Legendaries get a gold ring.
 */
export function weaponIconSvg(weapon: WeaponData, size = 64): string {
  const material = MATERIALS[weapon.material];
  const metal = material.color;
  const accent = material.accent;
  const glow = weapon.element ? ELEMENT_INFO[weapon.element].color : accent;
  const handleColor = weapon.material === 'wood' || weapon.archetype === 'staff' ? '#6a4a33' : metal;
  const parts: string[] = [];
  const isGrip = weapon.parts.handle === 'grip';
  // Where the handle ends and the head begins.
  const top = isGrip ? 60 : 32;

  if (isGrip) {
    parts.push(`<rect x="46.5" y="${top}" width="7" height="24" rx="2" fill="#5d4128"/>`);
    parts.push(`<circle cx="50" cy="88" r="5" fill="${accent}"/>`);
  } else {
    parts.push(`<rect x="47.8" y="${top}" width="4.4" height="${94 - top}" rx="2" fill="${handleColor}"/>`);
    parts.push(`<rect x="46.5" y="90" width="7" height="5" rx="1.5" fill="${accent}"/>`);
  }

  switch (weapon.parts.guard) {
    case 'crossguard':
      parts.push(`<rect x="36" y="${top - 2}" width="28" height="5" rx="2" fill="${accent}"/>`);
      break;
    case 'ring':
      parts.push(`<rect x="45" y="${top - 1}" width="10" height="7" rx="2" fill="${accent}"/>`);
      break;
    case 'wings':
      parts.push(`<path d="M47 ${top + 2} L34 ${top - 8} L46 ${top - 2} Z M53 ${top + 2} L66 ${top - 8} L54 ${top - 2} Z" fill="${accent}"/>`);
      break;
    default:
  }

  switch (weapon.parts.head) {
    case 'spearhead':
      parts.push(`<path d="M50 6 L58 ${top} L42 ${top} Z" fill="${metal}"/>`);
      if (weapon.element) parts.push(`<path d="M50 6 L53 18 L47 18 Z" fill="${glow}"/>`);
      break;
    case 'thunder-tip':
      parts.push(`<path d="M54 4 L42 18 L50 18 L44 ${top} L60 14 L52 14 Z" fill="${glow}"/>`);
      break;
    case 'blade':
      parts.push(`<path d="M50 6 L56 16 L56 ${top - 2} L44 ${top - 2} L44 16 Z" fill="${metal}"/>`);
      if (weapon.element) parts.push(`<rect x="49" y="16" width="2" height="${top - 20}" fill="${glow}"/>`);
      break;
    case 'axe-head':
      parts.push(`<path d="M52 ${top - 6} L72 ${top - 16} Q78 ${top} 72 ${top + 16} L52 ${top + 6} Z" fill="${metal}"/>`);
      if (weapon.element) parts.push(`<path d="M72 ${top - 16} Q78 ${top} 72 ${top + 16} L70 ${top + 12} Q75 ${top} 70 ${top - 12} Z" fill="${glow}"/>`);
      parts.push(`<rect x="46" y="${top - 6}" width="8" height="12" rx="2" fill="${accent}"/>`);
      break;
    case 'orb':
      parts.push(`<circle cx="50" cy="${top - 12}" r="12" fill="none" stroke="${accent}" stroke-width="3"/>`);
      parts.push(`<circle cx="50" cy="${top - 12}" r="7.5" fill="${weapon.element ? glow : metal}"/>`);
      break;
    case 'crescent':
      parts.push(`<path d="M36 ${top - 22} A16 16 0 1 0 64 ${top - 22} A12 12 0 1 1 36 ${top - 22} Z" fill="${metal}"/>`);
      parts.push(`<circle cx="50" cy="${top - 10}" r="4.5" fill="${weapon.element ? glow : accent}"/>`);
      break;
    default:
  }

  const ring = weapon.legendary
    ? `<circle cx="50" cy="50" r="46" fill="none" stroke="#f2c45a" stroke-width="3"/>`
    : '';
  const halo = weapon.element ? `<circle cx="50" cy="50" r="40" fill="${glow}" opacity="0.18"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${escapeAttr(weapon.name)}">`
    + `${halo}${ring}<g transform="rotate(45 50 50)" stroke="#141a33" stroke-width="1.6" stroke-linejoin="round">${parts.join('')}</g></svg>`;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
