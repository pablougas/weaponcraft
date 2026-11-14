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
    expect(s.world!.entities).toEqual({});
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
    await expect(menu.locator('[data-field="entities"]')).toHaveText('0');

    await menu.getByRole('button', { name: 'Spawn marker' }).click();
    await expect(menu.locator('[data-field="entities"]')).toHaveText('1');
    const world = (await state(page)).world!;
    expect(world.entities.e1).toMatchObject({ id: 'e1', defId: 'dev:marker' });

    await page.keyboard.press('Backquote');
    await expect(menu).toBeHidden();
  });

  test('the save round-trips across a reload, and New game resets it', { tag: '@smoke' }, async ({ page }) => {
    await openGame(page, '/', ['dev']);
    await page.locator('#wc-title').click();
    await page.keyboard.press('Backquote');
    await page.getByRole('button', { name: 'Spawn marker' }).click();
    await expect(page.locator('[data-field="entities"]')).toHaveText('1');
    const before = (await state(page)).world!;

    await page.reload(); // the page saves on pagehide
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    const after = (await state(page)).world!;
    expect(after.seed).toBe(before.seed);
    expect(after.entities).toEqual(before.entities);
    expect(after.tick).toBeGreaterThanOrEqual(before.tick);

    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.locator('#wc-title')).toHaveCount(0);
    const fresh = (await state(page)).world!;
    expect(fresh.entities).toEqual({});
    expect(fresh.flags.prologueDone).toBe(false);
    expect(fresh.nextEntityId).toBe(1);
    expect(await page.evaluate(() => Object.keys(localStorage).every((key) => key.startsWith('weaponcraft:')))).toBe(true);
  });
});
