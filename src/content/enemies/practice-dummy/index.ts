import type { EnemyDef } from '../../types';

/** A straw training dummy on a post. Never dies: it resets a few seconds after the last hit. */
export const practiceDummy: EnemyDef = {
  id: 'practice-dummy',
  name: 'Practice Dummy',
  approved: true,
  maxHealth: 60,
  body: { radius: 0.4, height: 1.8 },
  wanders: false,
  speed: 0,
  model: () => import('./model'),
};
