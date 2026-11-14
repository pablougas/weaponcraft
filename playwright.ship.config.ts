import { defineConfig } from '@playwright/test';
import { makeConfig } from './playwright.config';

// Lets production-only tests know they're running against dist/.
process.env.WC_SHIP = '1';

// Smoke suite against the production build in dist/ (run `npm run build` first;
// `npm run test:ship` does). Uses its own port so it never reuses a dev server
// or a stale preview.
export default defineConfig({
  ...makeConfig('http://localhost:4174', {
    command: 'npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 60_000,
  }),
  grep: /@smoke/,
});
