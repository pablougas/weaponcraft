import { expect, openGame, test } from './fixtures';

const state = (page: import('@playwright/test').Page) => page.evaluate(() => window.wc!.getState());

test.describe('sim core (M1)', () => {
  test('the sim ticks on its own and wc.step() runs exact ticks', async ({ page }) => {
    await openGame(page);
    const start = (await state(page)).world!.tick;
    await expect.poll(async () => (await state(page)).world!.tick).toBeGreaterThan(start);

    const delta = await page.evaluate(() => {
      const before = window.wc!.getState().world!.tick;
      const after = window.wc!.step(5).world!.tick;
      return after - before;
    });
    expect(delta).toBe(5);
  });

  test('a new game starts in the frozen golden-hour prologue with one local player', async ({ page }) => {
    await openGame(page);
    const s = await state(page);
    expect(s.time).toMatchObject({ source: 'prologue', phase: 'golden', hours: 16, minutes: 48 });
    expect(s.world!.flags).toMatchObject({ prologueDone: false, olympusShattered: false });
    expect(Object.keys(s.world!.players)).toEqual([s.localPlayerId]);
    // The meadow's cast: the local god on the rock, three dummies and five sheep.
    const defIds = Object.values(s.world!.entities).map((e) => e.defId).sort();
    expect(defIds).toEqual(['fusion-altar', 'practice-dummy', 'practice-dummy', 'practice-dummy', 'sheep', 'sheep', 'sheep', 'sheep', 'sheep', 'weapon-pickup', 'weapon-pickup', 'weapon-pickup', 'zeus']);
    expect(s.world!.players[s.localPlayerId!].entityId).toBe(Object.values(s.world!.entities).find((e) => e.defId === 'zeus')!.id);
  });

  test('backtick opens the dev menu with live readouts', async ({ page }) => {
    await openGame(page);
    await page.locator('#wc-title').click();
    const menu = page.locator('#wc-dev');
    await expect(menu).toBeHidden();

    await page.keyboard.press('Backquote');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-field="rate"]')).toHaveText(/^\d+ Hz$/);
    await expect(menu.locator('[data-field="time"]')).toHaveText('16:48 · golden (prologue)');
    const before = Number(await menu.locator('[data-field="entities"]').textContent());
    expect(before).toBeGreaterThanOrEqual(9);

    await menu.getByRole('button', { name: 'Spawn marker' }).click();
    await expect(menu.locator('[data-field="entities"]')).toHaveText(String(before + 1));
    const world = (await state(page)).world!;
    expect(Object.values(world.entities).filter((e) => e.defId === 'dev:marker')).toHaveLength(1);

    await page.keyboard.press('Backquote');
    await expect(menu).toBeHidden();
  });

  test('the save round-trips across a reload, and New game resets it', { tag: '@smoke' }, async ({ page }) => {
    await openGame(page, '/', ['dev']);
    await page.locator('#wc-title').click();
    await page.keyboard.press('Backquote');
    await page.getByRole('button', { name: 'Spawn marker' }).click();
    await expect.poll(async () => Object.values((await state(page)).world!.entities).some((e) => e.defId === 'dev:marker')).toBe(true);
    const before = (await state(page)).world!;
    const marker = Object.values(before.entities).find((e) => e.defId === 'dev:marker')!;

    await page.reload(); // the page saves on pagehide
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    const after = (await state(page)).world!;
    expect(after.seed).toBe(before.seed);
    expect(after.entities[marker.id]).toEqual(marker);
    expect(Object.keys(after.entities)).toEqual(expect.arrayContaining(Object.keys(before.entities).filter((id) => before.entities[id].defId !== 'sheep')));
    expect(after.tick).toBeGreaterThanOrEqual(before.tick);

    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.locator('#wc-title')).toHaveCount(0);
    const fresh = (await state(page)).world!;
    expect(Object.values(fresh.entities).some((e) => e.defId === 'dev:marker')).toBe(false);
    expect(fresh.flags.prologueDone).toBe(false);
    expect(fresh.seed).not.toBe(before.seed);
    expect(await page.evaluate(() => Object.keys(localStorage).every((key) => key.startsWith('weaponcraft:')))).toBe(true);
  });
});
