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

  test('W is Bolt Step: holding it does not walk, a press teleports about 8 m once', async ({ page }) => {
    await play(page);
    // Off the rock, on open meadow, facing away from everything.
    await page.evaluate(() => window.wc!.teleport(-20, -20, Math.PI));
    const start = hero(await state(page)).position;
    await page.keyboard.down('KeyW');
    await page.evaluate(() => window.wc!.step(30)); // held for a second: one flash, no walking
    await page.keyboard.up('KeyW');
    const s = await state(page);
    const p = hero(s).position;
    const moved = Math.hypot(p.x - start.x, p.z - start.z);
    expect(moved).toBeGreaterThan(6);
    expect(moved).toBeLessThan(9);
    expect(hero(s).hero!.cooldowns['bolt-step'] ?? 0).toBeGreaterThanOrEqual(0);
    await expect(page.locator('[data-hud="blink"] kbd')).toHaveText('W');
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
    // Walk off the rock and wait until Zeus is on the meadow: a roll needs solid ground,
    // and a press while falling only waits in the input buffer for 0.15 s.
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(45));
    await expect.poll(async () => {
      await page.evaluate(() => window.wc!.step(1));
      return hero(await state(page)).hero!.grounded;
    }, { timeout: 30_000 }).toBe(true);
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

  test('walking into the meadow edge for 5 s stays above ground, shows the edge caption, and you can walk back (M3.1)', async ({ page }) => {
    await play(page);
    // A gentle slope out to the edge (MEADOW_RADIUS = 140 m), facing outward.
    const bearing = (110 * Math.PI) / 180;
    await page.evaluate((b) => window.wc!.teleport(Math.sin(b) * 128, Math.cos(b) * 128, b), bearing);
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(150)); // 5 s of sim time pushing outward
    const atEdge = hero(await state(page));
    const r = Math.hypot(atEdge.position.x, atEdge.position.z);
    expect(r).toBeGreaterThan(134);
    expect(r).toBeLessThan(141);
    expect(atEdge.hero!.grounded).toBe(true);
    await expect(page.locator('#wc-captions')).toContainText('The rest of the world can wait. For now.');
    await page.keyboard.up('ArrowUp');

    await page.keyboard.down('ArrowDown');
    await page.evaluate(() => window.wc!.step(60));
    await page.keyboard.up('ArrowDown');
    const back = hero(await state(page));
    expect(Math.hypot(back.position.x, back.position.z)).toBeLessThan(r - 4);
  });
});
