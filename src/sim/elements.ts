import type { Element } from './types';

/**
 * The counter wheel (SPEC §7): Light > Shadow > Poison > Lightning > Light.
 * Hitting the element you beat does 2× damage; each element also applies a
 * status effect.
 */
export const ELEMENTS: readonly Element[] = ['light', 'shadow', 'poison', 'lightning'];

const BEATS: Readonly<Record<Element, Element>> = {
  light: 'shadow',
  shadow: 'poison',
  poison: 'lightning',
  lightning: 'light',
};

/**
 * `color` is the spec accent (glows, 3D); `text` is a lighter shade that stays
 * readable on the game's dark panels (Shadow's accent is too dark for text).
 */
export const ELEMENT_INFO: Readonly<Record<Element, { name: string; status: string; color: string; text: string }>> = {
  light: { name: 'Light', status: 'Blind', color: '#FFE08A', text: '#FFE08A' },
  shadow: { name: 'Shadow', status: 'Lifesteal', color: '#5B3A8C', text: '#C3A9F0' },
  poison: { name: 'Poison', status: 'Damage over time', color: '#7BC043', text: '#A6DB7A' },
  lightning: { name: 'Lightning', status: 'Chain / stun', color: '#6EC6FF', text: '#8FD3FF' },
};

/** Damage multiplier for an attack of `attack` element hitting a target of `target` element. */
export const SUPER_EFFECTIVE = 2;

export function beats(attack: Element, target: Element): boolean {
  return BEATS[attack] === target;
}

/** The element `element` is weak to. */
export function weakTo(element: Element): Element {
  return ELEMENTS.find((e) => BEATS[e] === element)!;
}

export function elementMultiplier(attack: Element | null | undefined, target: Element | null | undefined): number {
  if (!attack || !target) return 1;
  return beats(attack, target) ? SUPER_EFFECTIVE : 1;
}
