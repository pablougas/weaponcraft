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
  test('the up arrow walks forward', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    await play(page);
    const start = hero(await state(page)).position;
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => {
      const p = hero(await state(page)).position;
      return Math.hypot(p.x - start.x, p.z - start.z);
    }, { timeout: 20_000 }).toBeGreaterThan(1);
    await page.keyboard.up('ArrowUp');
    const moved = hero(await state(page));
    // The camera starts behind Zeus looking toward Olympus (−z), so ↑ walks that way.
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

  test('W no longer moves: letters are actions (M3.1)', async ({ page }) => {
    await play(page);
    const start = hero(await state(page)).position;
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.wc!.step(30));
    await page.keyboard.up('KeyW');
    const p = hero(await state(page)).position;
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeLessThan(0.05);
  });

  test('holding Q keeps firing Chain Lightning until stamina runs out', async ({ page }) => {
    await play(page);
    await page.keyboard.down('KeyQ');
    await expect.poll(async () => {
      const s = await state(page);
      return Object.values(s.world!.entities).some((e) => e.defId === 'practice-dummy' && e.health!.current < e.health!.max);
    }, { timeout: 20_000 }).toBe(true);
    await expect(page.locator('[data-hud="ability"]')).toHaveClass(/wc-active/);
    await page.evaluate(() => window.wc!.step(150));
    // 12 bolts × 8 stamina: held long enough, stamina is spent down to under one bolt.
    expect(hero(await state(page)).stamina!.current).toBeLessThan(8);
    await page.keyboard.up('KeyQ');
  });

  test('R calls down Sky Strike: drains stamina and hits the dummy in the ring', async ({ page }) => {
    await play(page);
    await page.keyboard.press('Tab'); // lock on so the strike lands on a target
    await expect.poll(async () => hero(await state(page)).hero!.lockTarget).not.toBeNull();
    const target = hero(await state(page)).hero!.lockTarget!;
    await page.keyboard.press('KeyR');
    await expect.poll(async () => hero(await state(page)).hero!.cooldowns['sky-strike'] ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(hero(await state(page)).stamina!.current).toBeLessThan(5);
    await page.evaluate(() => window.wc!.step(25));
    const t = (await state(page)).world!.entities[target];
    expect(!t || t.health!.current < t.health!.max).toBe(true);
  });

  test('X rolls at least 4 m', async ({ page }) => {
    await play(page);
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(20)); // step off the rock first
    const start = hero(await state(page)).position;
    await page.keyboard.press('KeyX');
    await page.evaluate(() => window.wc!.step(9));
    await page.keyboard.up('ArrowUp');
    const p = hero(await state(page)).position;
    expect(Math.hypot(p.x - start.x, p.z - start.z)).toBeGreaterThan(4);
  });

  test('A punches and a charged D (Lightning Fist) hits harder than a quick one', async ({ page }) => {
    await play(page);
    // Walk to the nearest dummy using the sim directly (deterministic, fast).
    const dummyDamage = async () => {
      const s = await state(page);
      return Object.values(s.world!.entities)
        .filter((e) => e.defId === 'practice-dummy')
        .reduce((sum, e) => sum + (e.health!.max - e.health!.current), 0);
    };
    await page.keyboard.press('Tab');
    await expect.poll(async () => hero(await state(page)).hero!.lockTarget).not.toBeNull();
    // Close the distance: hold ↑ toward the locked dummy.
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => {
      const s = await state(page);
      const h = hero(s);
      const t = s.world!.entities[h.hero!.lockTarget!];
      return Math.hypot(t.position.x - h.position.x, t.position.z - h.position.z);
    }, { timeout: 30_000 }).toBeLessThan(2.2);
    await page.keyboard.up('ArrowUp');
    const before = await dummyDamage();
    await page.keyboard.press('KeyA');
    await page.evaluate(() => window.wc!.step(12));
    const afterPunch = await dummyDamage();
    expect(afterPunch).toBeGreaterThan(before);
    await page.evaluate(() => window.wc!.step(90)); // dummies refill, cooldowns clear
    // Full charge: hold D for a second of sim time, then release.
    const base = await dummyDamage();
    await page.keyboard.down('KeyD');
    await page.evaluate(() => window.wc!.step(32));
    await page.keyboard.up('KeyD');
    await page.evaluate(() => window.wc!.step(20));
    expect((await dummyDamage()) - base).toBeGreaterThanOrEqual(40);
  });

  test('Tab locks on and shows the target in the HUD', async ({ page }) => {
    await play(page);
    await page.keyboard.press('Tab');
    await expect.poll(async () => hero(await state(page)).hero!.lockTarget).not.toBeNull();
    await expect(page.locator('[data-hud="target"]')).toBeVisible();
    await expect(page.locator('[data-hud="target-name"]')).toHaveText(/Practice Dummy|Sheep/);
  });
});
