import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const active = (s: State) => s.world!.entities[s.world!.players[s.localPlayerId!].entityId!];
const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];

/** A new game played through the prologue and the descent: Zeus in the grotto, Hades in the party. */
async function inGrotto(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
  await page.evaluate(() => window.wc!.step(541 + 905));
  await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
}

test.describe('playable Hades (M6)', () => {
  test('V switches control between Zeus and Hades; the HUD follows; the other god follows you', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await inGrotto(page);
    expect(active(await state(page)).defId).toBe('zeus');
    await expect(page.locator('.wc-ally')).toContainText('Hades');

    await page.keyboard.press('KeyV');
    await page.evaluate(() => window.wc!.step(2));
    expect(active(await state(page)).defId).toBe('hades');
    await expect(page.locator('#wc-hud [data-hud="ability"]')).toContainText('Soul Bolts');
    await expect(page.locator('#wc-hud [data-hud="blink"]')).toContainText('Shadow Step');
    await expect(page.locator('#wc-hud [data-hud="ultimate"]')).toContainText('Skull Cage');
    await expect(page.locator('.wc-ally')).toContainText('Zeus');

    // Walk Hades away: Zeus follows as the companion.
    await page.keyboard.down('ArrowLeft');
    await page.evaluate(() => window.wc!.step(90));
    await page.keyboard.up('ArrowLeft');
    await page.evaluate(() => window.wc!.step(60));
    const s = await state(page);
    const zeus = Object.values(s.world!.entities).find((e) => e.defId === 'zeus')!;
    const hades = active(s);
    expect(Math.hypot(zeus.position.x - hades.position.x, zeus.position.z - hades.position.z)).toBeLessThan(7);
    expect(consoleErrors).toEqual([]);
  });

  test('Hades’s moves on the keyboard: W decoy, Q bolts, R warns before the cage', async ({ page }) => {
    test.setTimeout(180_000);
    await inGrotto(page);
    await page.keyboard.press('KeyV');
    await page.evaluate(() => window.wc!.step(2));

    await page.keyboard.press('KeyW');
    await page.evaluate(() => window.wc!.step(2));
    let s = await state(page);
    expect(Object.values(s.world!.entities).some((e) => e.defId === 'shadow-decoy')).toBe(true);
    expect(active(s).hero!.cooldowns['shadow-step']).toBeGreaterThan(0);

    await page.evaluate(() => window.wc!.step(40));
    await page.keyboard.press('KeyQ');
    await page.evaluate(() => window.wc!.step(2));
    s = await state(page);
    expect(active(s).stamina!.current).toBeLessThan(active(s).stamina!.max);

    await page.evaluate(() => window.wc!.step(90));
    await page.keyboard.press('KeyR');
    await page.evaluate(() => window.wc!.step(30)); // 1 s: still only the warning
    s = await state(page);
    expect(active(s).hero!.ultimate).toMatchObject({ ticksLeft: expect.any(Number) });
    expect(active(s).hero!.ultimate!.ticksLeft).toBeGreaterThan(0);
  });
});
