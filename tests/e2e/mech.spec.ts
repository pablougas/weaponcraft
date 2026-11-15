import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];
/** "Cerberus Freed" length in ticks (sim/cutscenes/freed.ts FREED_BEATS.end = 13.5 s). */
const FREED_TICKS = 405;

async function inGrotto(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
  await page.evaluate(() => window.wc!.step(541 + 905));
  await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
}

test.describe('Cerberus Mk. II and freeing Cerberus (M7)', () => {
  test('sneak behind the Mk. II, break its plating, watch Cerberus go free; E howls for Zeus and for Hades; it all survives a reload', async ({ page, consoleErrors }) => {
    test.setTimeout(300_000);
    await inGrotto(page);
    await page.evaluate(() => window.wc!.breakBarricade());
    let s = await state(page);
    const mech = Object.values(s.world!.entities).find((e) => e.mech)!;
    expect(mech.mech!.mode).toBe('patrol');

    // E does nothing yet (no spirit freed): no Howl slot on the HUD.
    await expect(page.locator('[data-hud="spirit"]')).toHaveCount(0);

    // Worn down (the long fight is unit-tested); the last blows are real punches (A) from behind.
    await page.evaluate(() => window.wc!.weakenMech(0.02));
    for (let i = 0; i < 40; i += 1) {
      s = await state(page);
      const m = Object.values(s.world!.entities).find((e) => e.mech)!;
      if (s.world!.cutscene || m.mech!.mode === 'down') break;
      const plating = s.world!.entities[m.mech!.platingId!];
      const back = { x: -Math.sin(m.rotationY), z: -Math.cos(m.rotationY) };
      const x = plating.position.x + back.x * 3.2;
      const z = plating.position.z + back.z * 3.2;
      await page.evaluate(({ x, z, yaw }) => window.wc!.teleport(x, z, yaw), { x, z, yaw: Math.atan2(-back.x, -back.z) });
      await page.keyboard.press('KeyA');
      await page.evaluate(() => window.wc!.step(10));
    }
    s = await state(page);
    expect(s.world!.cutscene?.id).toBe('cerberus-freed');
    expect(Object.values(s.world!.entities).find((e) => e.mech)!.mech!.mode).toBe('down');

    // The scene: input is locked (arrow keys don't move the god), then control returns.
    const heroId = s.world!.players.p1.entityId!;
    const before = s.world!.entities[heroId].position;
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(60));
    await page.keyboard.up('ArrowUp');
    s = await state(page);
    expect(Math.hypot(s.world!.entities[heroId].position.x - before.x, s.world!.entities[heroId].position.z - before.z)).toBeLessThan(0.3);
    await page.evaluate((n) => window.wc!.step(n), FREED_TICKS);
    s = await state(page);
    expect(s.world!.cutscene).toBeNull();
    expect(s.world!.flags.cerberusFreed).toBe(true);
    expect(s.world!.objective).toBe('cerberus-freed');
    await expect(page.locator('#wc-captions')).toContainText('Three-Fold Howl unlocked');
    await expect(page.locator('[data-hud="spirit"]')).toBeVisible();

    // E: Three-Fold Howl, as Zeus…
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.wc!.step(2));
    s = await state(page);
    expect(s.world!.entities[s.world!.players.p1.entityId!].hero!.howl).toBeGreaterThan(0);
    // …and as Hades (V switches; each god has his own cooldown).
    await page.keyboard.press('KeyV');
    await page.evaluate(() => window.wc!.step(2));
    s = await state(page);
    const hades = s.world!.entities[s.world!.players.p1.entityId!];
    expect(hades.defId).toBe('hades');
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.wc!.step(2));
    s = await state(page);
    expect(s.world!.entities[hades.id].hero!.howl).toBeGreaterThan(0);

    // Saved: after a reload Cerberus is still free and the Mk. II still down.
    await page.reload();
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    s = await state(page);
    expect(s.world!.flags.cerberusFreed).toBe(true);
    expect(Object.values(s.world!.entities).find((e) => e.mech)!.mech!.mode).toBe('down');
    expect(consoleErrors).toEqual([]);
  });
});
