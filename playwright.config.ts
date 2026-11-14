import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * Browser tests. `npm run test:e2e` runs everything against the Vite dev
 * server; `npm run test:ship` (playwright.ship.config.ts) runs the smoke suite
 * against the built dist/ exactly as itch.io serves it.
 */
export function makeConfig(baseURL: string, webServer: PlaywrightTestConfig['webServer']): PlaywrightTestConfig {
  return {
    testDir: './tests/e2e',
    // SwiftShader renders slowly; never rely on real-time animation.
    timeout: 60_000,
    expect: {
      timeout: 15_000,
      toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
    },
    snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
      baseURL,
      trace: 'retain-on-failure',
    },
    projects: [
      {
        name: 'chromium-swiftshader',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1280, height: 720 },
          deviceScaleFactor: 1,
          launchOptions: {
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
          },
        },
      },
    ],
    webServer,
  };
}

export default defineConfig(makeConfig('http://localhost:5173', {
  command: 'npm run dev',
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
  timeout: 60_000,
}));
