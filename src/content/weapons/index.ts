import type { FusionRecipe, WeaponDef } from '../types';
import { makeWeapon } from './build';

export type { WeaponDef } from '../types';

// Registry: add a weapon below (or in its own file) and it's in the game.
// Approved weapons can be found in normal play; the rest only show on ?preview=weapons.

/** The 8 base weapons. */
const BASE: WeaponDef[] = [
  makeWeapon({
    id: 'starter-spear', name: 'Bronze Thunder Spear', archetype: 'spear', material: 'bronze', element: 'lightning', approved: true,
    parts: { head: 'thunder-tip' }, description: 'Zeus’s own spear, crackling at the tip.',
  }),
  makeWeapon({
    id: 'sunlit-sword', name: 'Sunlit Blade', archetype: 'sword', material: 'bronze', element: 'light', approved: true,
    description: 'Warm to the touch; it catches the evening sun.',
  }),
  makeWeapon({
    id: 'oak-staff', name: 'Shepherd’s Oak Staff', archetype: 'staff', material: 'wood', element: null, approved: true,
    description: 'Plain, sturdy and long. The sheep respect it.',
  }),
  makeWeapon({
    id: 'storm-axe', name: 'Storm-Iron Axe', archetype: 'axe', material: 'storm-iron', element: 'lightning', approved: true,
    description: 'Forged in a thunderstorm. Heavy, and it hums.',
  }),
  makeWeapon({
    id: 'nightfang', name: 'Nightfang', archetype: 'sword', material: 'storm-iron', element: 'shadow', approved: false,
    description: 'A blade that drinks what it cuts.',
  }),
  makeWeapon({
    id: 'viper-spear', name: 'Viper Spear', archetype: 'spear', material: 'bronze', element: 'poison', approved: false,
    description: 'Its point weeps green.',
  }),
  makeWeapon({
    id: 'grove-staff', name: 'Grove Staff', archetype: 'staff', material: 'wood', element: 'poison', approved: false,
    parts: { head: 'crescent' }, description: 'A living branch with a bitter sap.',
  }),
  makeWeapon({
    id: 'gearbreaker', name: 'Gearbreaker', archetype: 'axe', material: 'mech-brass', element: null, approved: false,
    description: 'Cut from a fallen mech’s armour.',
  }),
  makeWeapon({
    id: 'sea-trident', name: 'Sea Trident', archetype: 'spear', material: 'storm-iron', element: 'light', approved: true,
    parts: { head: 'crescent', guard: 'ring' }, description: 'Poseidon’s own trident. The sea answers when it strikes.',
  }),
  makeWeapon({
    id: 'shadow-bident', name: 'Shadow Bident', archetype: 'spear', material: 'storm-iron', element: 'shadow', approved: true,
    parts: { head: 'crescent' }, description: 'Hades’s own two-pronged spear. What it wounds feeds its master.',
  }),
];

/** The 6 named legendaries, made only by fusion (see FUSIONS). Divine ore, mixed parts. */
const LEGENDARIES: WeaponDef[] = [
  makeWeapon({
    id: 'dawnbringer', name: 'Dawnbringer', archetype: 'spear', material: 'divine-ore', element: 'light', legendary: true, approved: true,
    parts: { head: 'blade', guard: 'wings' }, description: 'A sword’s edge on a god’s spear. The first light of morning.',
  }),
  makeWeapon({
    id: 'thunderclap-halberd', name: 'Thunderclap Halberd', archetype: 'axe', material: 'divine-ore', element: 'lightning', legendary: true, approved: true,
    parts: { handle: 'pole', guard: 'ring' }, description: 'Every swing lands like a storm breaking.',
  }),
  makeWeapon({
    id: 'skyherds-crook', name: 'Skyherd’s Crook', archetype: 'staff', material: 'divine-ore', element: 'lightning', legendary: true, approved: true,
    parts: { head: 'crescent', guard: 'wings' }, description: 'The shepherd of storms keeps their flock in line.',
  }),
  makeWeapon({
    id: 'twilight-edge', name: 'Twilight Edge', archetype: 'sword', material: 'divine-ore', element: 'shadow', legendary: true, approved: false,
    parts: { guard: 'wings' }, description: 'Half dusk, half dawn, and sharp on both sides.',
  }),
  makeWeapon({
    id: 'hydras-fang', name: 'Hydra’s Fang', archetype: 'spear', material: 'divine-ore', element: 'poison', legendary: true, approved: false,
    parts: { head: 'crescent' }, description: 'Cut one head off and it grows two more.',
  }),
  makeWeapon({
    id: 'titans-cleaver', name: 'Titan’s Cleaver', archetype: 'axe', material: 'divine-ore', element: 'lightning', legendary: true, approved: false,
    parts: { guard: 'crossguard' }, description: 'Made from a mech’s heart and a storm.',
  }),
];

export const weapons: readonly WeaponDef[] = [...BASE, ...LEGENDARIES];

/**
 * The Fusion Altar's discovery table (SPEC §8). Order doesn't matter: the sim
 * keys it by the sorted pair. Any other pair makes a generic fused weapon.
 */
export const FUSIONS: readonly FusionRecipe[] = [
  { a: 'starter-spear', b: 'sunlit-sword', result: 'dawnbringer' },
  { a: 'starter-spear', b: 'storm-axe', result: 'thunderclap-halberd' },
  { a: 'starter-spear', b: 'oak-staff', result: 'skyherds-crook' },
  { a: 'sunlit-sword', b: 'nightfang', result: 'twilight-edge' },
  { a: 'viper-spear', b: 'grove-staff', result: 'hydras-fang' },
  { a: 'storm-axe', b: 'gearbreaker', result: 'titans-cleaver' },
];
