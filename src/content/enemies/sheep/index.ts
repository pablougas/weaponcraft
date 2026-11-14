import type { EnemyDef } from '../../types';

/** Meadow wildlife: wanders, bolts when hit, and new sheep arrive over time. */
export const sheep: EnemyDef = {
  id: 'sheep',
  name: 'Sheep',
  approved: true,
  maxHealth: 30,
  body: { radius: 0.6, height: 1.4 },
  wanders: true,
  speed: 1.3,
  model: () => import('./model'),
};
