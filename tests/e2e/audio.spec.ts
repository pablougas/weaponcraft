import { expect, openGame, test } from './fixtures';

declare global {
  interface Window { __oscillators?: number; __noises?: number }
}

const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];
const oscillators = (page: import('@playwright/test').Page) => page.evaluate(() => window.__oscillators ?? 0);
const noises = (page: import('@playwright/test').Page) => page.evaluate(() => window.__noises ?? 0);

test.describe('audio (M8)', () => {
  test('music plays in the meadow and the Underworld; footsteps sound; volumes are saved', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    // Count every oscillator the game starts (music notes, drones and sound effects).
    await page.addInitScript(() => {
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
        window.__oscillators = (window.__oscillators ?? 0) + 1;
        return original.call(this);
      };
      // Noise bursts are sound effects only (the music is all oscillators).
      const originalBuffer = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function patched(this: AudioContext) {
        window.__noises = (window.__noises ?? 0) + 1;
        return originalBuffer.call(this);
      };
    });
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    await expect.poll(() => page.evaluate(() => window.wc!.getState().screen)).toBe('playing');

    // The meadow's music starts after the click (real time: the render loop schedules it).
    await expect.poll(() => oscillators(page), { timeout: 20_000 }).toBeGreaterThan(4);

    // Walking on grass makes footsteps (noise bursts; the music never uses noise).
    const beforeWalk = await noises(page);
    // (Footsteps are checked once per rendered frame and SwiftShader renders slowly, so keep walking until two are heard.)
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => {
      await page.evaluate(() => window.wc!.step(5));
      return noises(page);
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(beforeWalk + 2);
    await page.keyboard.up('ArrowUp');

    // Into the Underworld: its own music keeps playing there.
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await page.evaluate(() => window.wc!.step(541 + 905));
    await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
    const underworld = await oscillators(page);
    await expect.poll(() => oscillators(page), { timeout: 20_000 }).toBeGreaterThan(underworld + 3);

    // Volume sliders in the Esc menu are saved in this browser.
    await page.keyboard.press('Escape');
    await expect(page.locator('#wc-settings')).toBeVisible();
    await page.locator('[data-volume="music"]').fill('0.25');
    await page.locator('[data-volume="sfx"]').fill('0.5');
    await expect(page.locator('[data-volume-output="music"]')).toHaveText('25%');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('weaponcraft:settings:v1') ?? '{}'));
    expect(saved.volume).toMatchObject({ music: 0.25, sfx: 0.5 });
    expect(consoleErrors).toEqual([]);
  });
});
