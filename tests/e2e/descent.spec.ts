import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const hero = (s: State) => s.world!.entities[s.world!.players[s.localPlayerId!].entityId!];
const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];
const ROCKET_TICKS = 541;
const DESCENT_TICKS = 900;

test.describe('Hades and the descent (M5.1)', () => {
  test('rocket → Hades scene → grotto → objective; control returns as Zeus; reload keeps it', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await page.evaluate((n) => window.wc!.step(n), ROCKET_TICKS);

    // Straight into the descent: input still locked, HUD hidden.
    let s = await state(page);
    expect(s.world!.cutscene).toMatchObject({ id: 'descent' });
    await expect(page.locator('#wc-hud')).toBeHidden();
    await page.evaluate(() => window.wc!.step(60));
    s = await state(page);
    expect(Object.values(s.world!.entities).some((e) => e.defId === 'hades' && e.npc)).toBe(true);
    const before = hero(s).position;
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(30));
    await page.keyboard.up('ArrowUp');
    const during = hero(await state(page)).position;
    expect(Math.hypot(during.x - before.x, during.z - before.z)).toBeLessThan(0.05);
    await expect(page.locator('#wc-captions')).toContainText(/Hades/);

    // Through the portal to the Outer Grotto, the dispatch, then control returns.
    await page.evaluate((n) => window.wc!.step(n), DESCENT_TICKS);
    s = await state(page);
    expect(s.world!.cutscene).toBeNull();
    expect(hero(s).region).toBe('underworld');
    expect(s.world!.objective).toBe('find-and-free-cerberus');
    expect(s.world!.flags).toMatchObject({ olympusShattered: true, prologueDone: true, descended: true, grottoBuilt: true });
    await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#wc-tutorial')).toContainText('Find and free Cerberus.', { timeout: 20_000 });
    // Zeus is the one under control; Hades stands in the grotto as a story character.
    expect(hero(s).defId).toBe('zeus');
    const hades = Object.values(s.world!.entities).find((e) => e.defId === 'hades')!;
    expect(hades).toMatchObject({ npc: { name: 'Hades' }, region: 'underworld' });
    expect(hades.hero).toBeUndefined();

    await page.keyboard.down('ArrowLeft');
    await page.evaluate(() => window.wc!.step(30));
    await page.keyboard.up('ArrowLeft');
    const after = hero(await state(page)).position;
    expect(Math.hypot(after.x - during.x, after.z - during.z)).toBeGreaterThan(1);

    // The save keeps the grotto start, the clue and the objective.
    await page.reload();
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    s = await state(page);
    expect(s.world!.cutscene).toBeNull();
    expect(s.world!.objective).toBe('find-and-free-cerberus');
    expect(hero(s).region).toBe('underworld');
    expect(Object.values(s.world!.entities).some((e) => e.structure?.kind === 'dispatch')).toBe(true);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.locator('#wc-tutorial')).toContainText('Find and free Cerberus.', { timeout: 20_000 });
    expect(await page.evaluate(() => localStorage.getItem('weaponcraft:progress:v1'))).toContain('descent');
    expect(consoleErrors).toEqual([]);
  });
});
