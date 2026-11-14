import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// Vitest covers TypeScript sim/engine logic only. Node's runner keeps
// tests/*.test.mjs and Playwright owns tests/e2e.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
