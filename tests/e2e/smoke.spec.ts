import { canvasStats, expect, openGame, test } from './fixtures';

// Must pass before every itch.io upload (`npm run test:ship`).
test.describe('smoke', { tag: '@smoke' }, () => {
  test('loads with no console errors', async ({ page, consoleErrors }) => {
    await openGame(page);
    await expect(page.locator('#wc-title')).toBeVisible();
    expect(await page.evaluate(() => window.wc!.getState().physicsReady)).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('makes no requests outside its own origin', async ({ page, offOriginRequests }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    await expect.poll(() => page.evaluate(() => window.wc!.getState().screen)).toBe('playing');
    expect(offOriginRequests).toEqual([]);
  });

  test('click-to-start leaves the title screen', async ({ page, consoleErrors }) => {
    await openGame(page);
    const title = page.locator('#wc-title');
    await expect(title).toContainText('WEAPONCRAFT');
    await expect(page.locator('#wc-loading')).toHaveCount(0);
    expect(await page.evaluate(() => window.wc!.getState().screen)).toBe('title');

    await title.click();

    await expect(title).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.wc!.getState().screen)).toBe('playing');
    expect(consoleErrors).toEqual([]);
  });

  test('renders a non-blank canvas', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    await expect(page.locator('#wc-title')).toHaveCount(0);
    const stats = await canvasStats(page);
    expect(stats.colors, 'distinct colours in the canvas').toBeGreaterThan(8);
    expect(stats.brightness, 'average brightness').toBeGreaterThan(30);
  });

  test('canvas follows window resizes', async ({ page }) => {
    await openGame(page);
    const size = () => page.locator('#wc-canvas').evaluate((canvas: HTMLCanvasElement) => ({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
      bufferWidth: canvas.width,
    }));
    expect(await size()).toMatchObject({ width: 1280, height: 720 });
    await page.setViewportSize({ width: 900, height: 600 });
    await expect.poll(size).toMatchObject({ width: 900, height: 600, bufferWidth: 900 });
  });

  test('the Phaser demo is still reachable at ?demo=2d', async ({ page, consoleErrors }) => {
    await page.goto('/?demo=2d');
    await expect(page.locator('#game canvas')).toBeVisible();
    await expect(page.locator('#score')).toHaveText('Ore: 0 / 5');
    await expect(page.locator('#wc-loading')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  test('production hides the test API without #test', async ({ page }) => {
    test.skip(!process.env.WC_SHIP, 'Dev builds always expose window.wc.');
    await page.goto('/');
    // Without #test there's no ready() to wait on; allow for a slow (busy) machine.
    await expect(page.locator('#wc-title')).toBeVisible({ timeout: 45_000 });
    expect(await page.evaluate(() => 'wc' in window)).toBe(false);
  });

  test('production hides the dev menu unless the URL has #dev', async ({ page }) => {
    test.skip(!process.env.WC_SHIP, 'Dev builds always allow the dev menu.');
    await openGame(page);
    await page.locator('#wc-title').click();
    await page.keyboard.press('Backquote');
    await expect(page.locator('#wc-dev')).toHaveCount(0);

    await page.goto('/#test&dev');
    await page.reload(); // a hash-only change doesn't reload the page
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    await page.locator('#wc-title').click();
    await page.keyboard.press('Backquote');
    await expect(page.locator('#wc-dev')).toBeVisible();
  });

  test('Esc opens settings', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    await expect(page.locator('#wc-title')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wc-settings')).toBeVisible();
    await expect(page.locator('#wc-settings')).toContainText('Settings');
    await page.locator('#wc-settings').getByRole('button', { name: 'Resume' }).click();
    await expect(page.locator('#wc-settings')).toBeHidden();
  });
});
