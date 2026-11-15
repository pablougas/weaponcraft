import type { EnemyDef } from '../types';
import { practiceDummy } from './practice-dummy';
import { sheep } from './sheep';
import { sentry, sentryCaptain, soldierArcher, soldierShield, soldierSpear } from './soldier';
import { theWarden } from './warden';

export type { EnemyDef } from '../types';

// Registry: add a folder here and one line below. Never edit the engine.
// Holds everything non-player you can hit: dummies, wildlife, later soldiers.
export const enemies: readonly EnemyDef[] = [practiceDummy, sheep, soldierSpear, soldierShield, soldierArcher, sentry, sentryCaptain, theWarden];
