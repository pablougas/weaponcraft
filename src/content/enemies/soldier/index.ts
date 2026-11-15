import type { EnemyDef } from '../../types';

/**
 * The humans' soldiers and sentries in the Underworld (SPEC §9, M6). Their
 * behaviour lives in sim/systems/soldiers.ts; these entries give each a name,
 * a body and the shared model. Part of the current milestone (CLAUDE.md
 * exception): shown to the team in the running game and the review page.
 */
const soldier = (id: string, name: string, maxHealth: number): EnemyDef => ({
  id, name, approved: true, maxHealth, body: { radius: 0.36, height: 1.8 }, wanders: false, speed: 0, model: () => import('./model'),
});

export const soldierSpear = soldier('soldier-spear', 'Spearman', 60);
export const soldierShield = soldier('soldier-shield', 'Shield-bearer', 85);
export const soldierArcher = soldier('soldier-archer', 'Archer', 45);
export const sentry = soldier('sentry', 'Sentry', 40);
