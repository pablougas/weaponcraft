import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const hero = (s: State) => s.world!.entities[s.world!.players[s.localPlayerId!].entityId!];

/** Starts a fresh game with a fixed seed and waits for Zeus to settle on the rock. */
async function play(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  await expect(page.locator('#wc-title')).toHaveCount(0);
  await expect(page.locator('#wc-hud')).toBeVisible();
  await expect.poll(async () => hero(await state(page)).hero!.grounded).toBe(true);
}

test.describe('Zeus (M3)', () => {
  test('W walks forward', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    await play(page);
    const start = hero(await state(page)).position;
    await page.keyboard.down('KeyW');
    await expect.poll(async () => {
      const p = hero(await state(page)).position;
      return Math.hypot(p.x - start.x, p.z - start.z);
    }, { timeout: 20_000 }).toBeGreaterThan(1);
    await page.keyboard.up('KeyW');
    const moved = hero(await state(page));
    // The camera starts behind Zeus looking toward Olympus (−z), so W walks that way.
    expect(moved.position.z).toBeLessThan(start.z);
    expect(moved.hero!.moving || moved.position.z < start.z).toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test('Space leaves the ground', async ({ page }) => {
    await play(page);
    const startY = hero(await state(page)).position.y;
    await page.keyboard.down('Space'); // held: jump, then hover
    await expect.poll(async () => {
      const h = hero(await state(page));
      return !h.hero!.grounded && h.position.y > startY + 0.2;
    }, { timeout: 20_000 }).toBe(true);
    await page.keyboard.up('Space');
    await expect.poll(async () => hero(await state(page)).hero!.grounded, { timeout: 30_000 }).toBe(true);
  });

  test('Q chains lightning into a practice dummy', async ({ page }) => {
    await play(page);
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => {
      const s = await state(page);
      return Object.values(s.world!.entities).some((e) => e.defId === 'practice-dummy' && e.health!.current < e.health!.max);
    }, { timeout: 20_000 }).toBe(true);
    const s = await state(page);
    expect(hero(s).hero!.cooldowns['chain-lightning']).toBeGreaterThan(0);
    await expect(page.locator('[data-hud="ability"]')).toHaveClass(/wc-cooling/);
  });

  test('Tab locks on and shows the target in the HUD', async ({ page }) => {
    await play(page);
    await page.keyboard.press('Tab');
    await expect.poll(async () => hero(await state(page)).hero!.lockTarget).not.toBeNull();
    await expect(page.locator('[data-hud="target"]')).toBeVisible();
    await expect(page.locator('[data-hud="target-name"]')).toHaveText(/Practice Dummy|Sheep/);
  });
});
