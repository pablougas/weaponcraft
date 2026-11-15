import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const hero = (s: State) => s.world!.entities[s.world!.players[s.localPlayerId!].entityId!];
const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];

async function start(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  await expect(page.locator('#wc-title')).toHaveCount(0);
}

test.describe('prologue and the rocket (M5)', () => {
  test('tutorial → cinematic (input locked, HUD hidden) → control returns with Olympus shattered', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    await start(page);
    await expect(page.locator('#wc-tutorial')).toContainText('The Last Calm Day');
    await expect(page.locator('[data-step="move"]')).toContainText('↑');
    await expect(page.locator('[data-step="move"]')).toContainText('↓');
    await expect(page.locator('[data-step="attack"]')).toContainText('A');
    await expect(page.locator('[data-step="ability"]')).toContainText('Q');
    await expect(page.locator('[data-step="pickup"]')).toContainText('F');
    expect((await state(page)).time).toMatchObject({ source: 'prologue', phase: 'golden' });

    for (const step of STEPS.slice(0, -1)) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await expect(page.locator('#wc-tutorial')).toContainText('Fusion Altar');
    await page.evaluate(() => window.wc!.completeTutorialStep('fuse'));

    // The cinematic is running: no HUD, no tutorial panel, and the keyboard does nothing.
    let s = await state(page);
    expect(s.world!.cutscene).toMatchObject({ id: 'rocket', skippable: false });
    await expect(page.locator('#wc-hud')).toBeHidden();
    await expect(page.locator('#wc-tutorial')).toBeHidden();
    const before = hero(s).position;
    await page.keyboard.down('ArrowUp');
    await page.keyboard.press('KeyW');
    await page.evaluate(() => window.wc!.step(60));
    await page.keyboard.up('ArrowUp');
    const during = hero(await state(page)).position;
    expect(Math.hypot(during.x - before.x, during.z - before.z)).toBeLessThan(0.05);
    // Enter doesn't skip the first time.
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.wc!.step(1));
    expect((await state(page)).world!.cutscene).not.toBeNull();

    // Play it out (18 s of sim time). Control does not return: Hades's arrival follows straight on.
    await page.evaluate(() => window.wc!.step(560));
    s = await state(page);
    expect(s.world!.flags.olympusShattered).toBe(true);
    expect(s.world!.cutscene).toMatchObject({ id: 'descent', skippable: false });
    expect(s.world!.flags.prologueDone).toBe(false);
    await expect(page.locator('#wc-hud')).toBeHidden();
    // This browser remembers it has seen the rocket.
    expect(await page.evaluate(() => localStorage.getItem('weaponcraft:progress:v1'))).toContain('"seenRocket":true');
    expect(consoleErrors).toEqual([]);
  });

  test('finishing the last tutorial item closes the altar and starts the rocket without movement', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.wc!.freeze(1));
    for (const step of ['move', 'sprint', 'jump', 'attack', 'ability']) {
      await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    }

    // Complete pickup through the real interaction, then open the altar.
    await page.evaluate(() => window.wc!.teleport(12, 7));
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.wc!.step(1));
    await page.evaluate(() => window.wc!.teleport(8, 3));
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.wc!.step(1));
    const altar = page.locator('#wc-altar');
    await expect(altar).toBeVisible();

    await altar.locator('[data-slot="0"]').click();
    await altar.locator('[data-slot="1"]').click();
    await altar.locator('[data-action="fuse"]').click();
    await page.evaluate(() => window.wc!.step(1));

    await expect(altar).toBeHidden();
    expect((await state(page)).world!.cutscene).toMatchObject({ id: 'rocket' });
    await expect(page.locator('#wc-tutorial')).toBeHidden();
  });

  test('after seeing it once, a new game can skip the rocket (into the descent) with Enter', async ({ page }) => {
    await page.goto('/#test');
    await page.evaluate(() => localStorage.setItem('weaponcraft:progress:v1', JSON.stringify({ seenRocket: true })));
    await page.reload();
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    await page.evaluate(() => window.wc!.step(1)); // the client declares it has seen the rocket
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    expect((await state(page)).world!.cutscene).toMatchObject({ skippable: true });
    await expect(page.locator('#wc-skip')).toContainText('Skip');
    await page.keyboard.press('Enter');
    await page.evaluate(() => window.wc!.step(1));
    const s = await state(page);
    expect(s.world!.cutscene).toMatchObject({ id: 'descent', skippable: false });
    expect(s.world!.flags.olympusShattered).toBe(true);
  });

  test('Reduce motion removes the impact camera shake', async ({ page }) => {
    test.setTimeout(180_000); // two cinematics rendered frame by frame in software WebGL
    await start(page);
    const shakeAround = async () => {
      // Stand still at the impact and read the shake over several ticks.
      const values: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        await page.evaluate(async () => { window.wc!.step(4); await window.wc!.freeze(1); });
        values.push((await state(page)).cameraShake);
      }
      return values;
    };
    await page.evaluate(async () => { await window.wc!.freeze(1); });
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await page.evaluate(async () => { window.wc!.step(182); await window.wc!.freeze(1); }); // just before impact (6 s)
    expect(Math.max(...await shakeAround())).toBeGreaterThan(0.02);

    // Same moment with Reduce motion on: no shake at all.
    await page.evaluate(async () => { await window.wc!.setSeed(7); });
    await page.keyboard.press('Escape');
    await page.locator('#wc-settings').getByLabel('Reduce motion & flashes').check();
    await page.locator('#wc-settings').getByRole('button', { name: 'Resume' }).click();
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await page.evaluate(async () => { window.wc!.step(182); await window.wc!.freeze(1); });
    expect(Math.max(...await shakeAround())).toBe(0);
  });
});
