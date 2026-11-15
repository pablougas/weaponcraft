import { test as base, expect, type Page } from '@playwright/test';
import { DESCENT_LENGTH } from '../../src/sim/cutscenes/descent';
import { TUTORIAL_STEPS } from '../../src/sim/tutorial';

/** Every prologue tutorial step (the game's own list). */
export const STEPS: readonly string[] = TUTORIAL_STEPS;
/** Ticks from the tutorial's end until play resumes in the Outer Grotto: the rocket (541) and the descent, plus a few. */
export const TO_GROTTO = 541 + DESCENT_LENGTH + 5;

/**
 * Shared fixtures for every browser test:
 * - `consoleErrors`: console errors and uncaught page errors seen so far.
 * - `offOriginRequests`: requests to any host other than the game's own
 *   origin. They are blocked (no CDNs, no runtime network) and recorded so a
 *   test can assert the list is empty.
 */
export const test = base.extend<{ consoleErrors: string[]; offOriginRequests: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
  },
  offOriginRequests: async ({ page, baseURL }, use) => {
    const blocked: string[] = [];
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== origin) {
        blocked.push(url.href);
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    await use(blocked);
  },
});

export { expect };

/**
 * Opens the game with the test API enabled (plus any extra hash flags, e.g.
 * `['dev']` for the dev menu in production) and waits until it has rendered.
 */
export async function openGame(page: Page, path = '/', flags: string[] = []): Promise<void> {
  await page.goto(`${path}#${['test', ...flags].join('&')}`);
  await page.waitForFunction(() => window.wc !== undefined);
  await page.evaluate(() => window.wc!.ready());
}

/**
 * Screenshots the canvas and measures it in the browser: how many distinct
 * (coarsely quantized) colours it shows and its average brightness. Waits for
 * the loading and title overlays to be gone so only the 3D view is measured.
 */
export async function canvasStats(page: Page): Promise<{ colors: number; brightness: number }> {
  await expect(page.locator('#wc-loading, #wc-title')).toHaveCount(0);
  const png = await page.locator('#wc-canvas').screenshot();
  return page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set<number>();
    let sum = 0;
    let samples = 0;
    for (let i = 0; i < data.length; i += 4 * 37) {
      colors.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
      samples += 1;
    }
    return { colors: colors.size, brightness: sum / samples };
  }, png.toString('base64'));
}
