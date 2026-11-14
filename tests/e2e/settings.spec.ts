import { expect, openGame, test } from './fixtures';

const state = (page: import('@playwright/test').Page) => page.evaluate(() => window.wc!.getState());

test.describe('settings (M2)', () => {
  test('settings are saved per browser and survive a reload', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    await page.keyboard.press('Escape');
    const menu = page.locator('#wc-settings');
    await menu.getByLabel('Bloom').uncheck();
    await menu.getByLabel('Reduce motion & flashes').check();
    await menu.getByLabel('Quality').selectOption('low');
    await menu.getByLabel('Time of day').selectOption('night');
    await expect.poll(async () => (await state(page)).settings).toMatchObject({
      quality: 'low', reduceMotion: true, timeOfDay: 'night', effects: { bloom: false, godRays: true },
    });
    expect((await state(page)).quality).toBe('low');

    await page.reload();
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    expect((await state(page)).settings).toMatchObject({ quality: 'low', reduceMotion: true, timeOfDay: 'night' });
    expect(await page.evaluate(() => localStorage.getItem('weaponcraft:settings:v1'))).toContain('"night"');
  });

  test('auto quality resolves to Medium in test runs', async ({ page }) => {
    await openGame(page);
    expect(await state(page)).toMatchObject({ quality: 'medium', settings: { quality: 'auto' } });
  });

  test('the prologue keeps golden hour even with a time-of-day lock', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    await page.keyboard.press('Escape');
    await page.locator('#wc-settings').getByLabel('Time of day').selectOption('night');
    expect((await state(page)).time).toMatchObject({ source: 'prologue', phase: 'golden' });
  });

  test('New game in settings needs a second click', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    const seed = (await state(page)).world!.seed;
    await page.keyboard.press('Escape');
    const button = page.locator('#wc-settings').getByRole('button', { name: 'New game' });
    await button.click();
    await expect(page.locator('#wc-settings').getByRole('button', { name: 'Click again to start over' })).toBeVisible();
    expect((await state(page)).world!.seed).toBe(seed);
    await page.locator('#wc-settings').getByRole('button', { name: 'Click again to start over' }).click();
    await expect(page.locator('#wc-settings')).toBeHidden();
    expect((await state(page)).world!.seed).not.toBe(seed);
  });

  test('wc.setSeed starts a new world with that seed', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(4242));
    expect((await state(page)).world).toMatchObject({ seed: 4242, tick: expect.any(Number) });
  });
});
