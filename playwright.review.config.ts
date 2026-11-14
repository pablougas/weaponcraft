import { defineConfig } from '@playwright/test';
import config from './playwright.config';

/**
 * Renders every screenshot test into artifacts/review/ for the team to look
 * at, without touching the approved baselines in tests/e2e/__screenshots__/.
 * Run with `npm run test:visual:review`.
 */
export default defineConfig({
  ...config,
  snapshotPathTemplate: 'artifacts/review/{arg}{ext}',
  grep: /@visual/,
  updateSnapshots: 'all',
});
