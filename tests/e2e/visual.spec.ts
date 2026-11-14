import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

// Approved screenshots are how a look gets signed off (CLAUDE.md). If one of
// these fails after an intended change, show the team `npx playwright
// show-report` and run `npm run test:visual:update` only once they approve.

test.describe.configure({ timeout: 180_000 });

// Software WebGL renders the meadow slowly; give each screenshot time to settle.
const SHOT = { timeout: 60_000 };

type Camera = 'vista' | 'hero' | 'wide' | 'yard' | 'follow';

/**
 * Starts the game, freezes the clock, and starts a fresh world from a fixed
 * seed so every frame is identical. The HUD is hidden unless `hud` is set
 * (CLAUDE.md: baselines show the HUD only when the HUD is under test).
 * Camera 'follow' keeps the in-game camera behind Zeus.
 */
async function frozenScene(page: Page, dayFraction: number, camera: Camera = 'vista', { hud = false } = {}) {
  await openGame(page);
  await page.locator('#wc-title').click();
  await expect(page.locator('#wc-title, #wc-loading')).toHaveCount(0);
  if (!hud) await page.addStyleTag({ content: '#wc-hud { display: none !important; }' });
  await page.evaluate(async ({ dayFraction, camera }) => {
    await window.wc!.freeze(12);
    await window.wc!.setSeed(7);
    await window.wc!.setTime(dayFraction);
    if (camera !== 'follow') await window.wc!.snapCam(camera);
  }, { dayFraction, camera });
}

test.describe('the look (M2)', { tag: '@visual' }, () => {
  for (const [name, dayFraction] of [
    ['golden', 0.7],
    ['dusk', 0.77],
    ['night', 0.92],
    ['dawn', 0.25],
    ['noon', 0.5],
  ] as const) {
    test(`vista at ${name}`, async ({ page }) => {
      await frozenScene(page, dayFraction);
      await expect(page).toHaveScreenshot(`vista-${name}.png`, SHOT);
    });
  }

  test('wide shot at golden hour', async ({ page }) => {
    await frozenScene(page, 0.7, 'wide');
    await expect(page).toHaveScreenshot('wide-golden.png', SHOT);
  });

  test('every effect off at golden hour', async ({ page }) => {
    await frozenScene(page, 0.7);
    await page.keyboard.press('Escape');
    const menu = page.locator('#wc-settings');
    await expect(menu).toBeVisible();
    for (const name of ['Bloom', 'God rays', 'Outlines', 'Color grade', 'Particles']) {
      await menu.getByLabel(name).uncheck();
    }
    await menu.getByRole('button', { name: 'Resume' }).click();
    await expect(menu).toBeHidden();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('vista-golden-effects-off.png', SHOT);
  });

  test('settings menu', async ({ page }) => {
    await frozenScene(page, 0.7);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wc-settings')).toBeVisible();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('settings-menu.png', SHOT);
  });

  for (const expression of ['neutral', 'determined', 'happy', 'hurt'] as const) {
    test(`Zeus close-up, ${expression}`, async ({ page }) => {
      await frozenScene(page, 0.7, 'hero');
      await page.evaluate((e) => window.wc!.face(e), expression);
      await expect(page).toHaveScreenshot(`zeus-${expression}.png`, SHOT);
    });
  }

  test('in-game camera with the HUD', async ({ page }) => {
    await frozenScene(page, 0.7, 'follow', { hud: true });
    await expect(page.locator('#wc-hud')).toBeVisible();
    await expect(page).toHaveScreenshot('hud.png', SHOT);
  });

  test('practice yard: dummies and sheep', async ({ page }) => {
    await frozenScene(page, 0.7, 'yard');
    await expect(page).toHaveScreenshot('yard.png', SHOT);
  });
});
