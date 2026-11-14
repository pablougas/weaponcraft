import type { WeaponDef } from '../types';
import { starterSpear } from './starter-spear';

export type { WeaponDef } from '../types';

// Registry: add a file here and one line below. Never edit the engine.
export const weapons: readonly WeaponDef[] = [starterSpear];
