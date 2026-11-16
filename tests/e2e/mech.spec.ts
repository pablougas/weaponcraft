import type { Page } from '@playwright/test';
import { expect, openGame, test, STEPS, TO_GROTTO } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
/** "Cerberus Freed" length in ticks (sim/cutscenes/freed.ts FREED_BEATS.end = 33 s). */
const FREED_TICKS = 1530; // the freed scene (51 s)
/** "The Warden" length in ticks (sim/cutscenes/warden.ts WARDEN_BEATS.end = 10 s). */
const WARDEN_TICKS = 300;

async function inGrotto(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
  await page.evaluate((n) => window.wc!.step(n), TO_GROTTO);
  await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
}

test.describe('Cerberus Mk. II, the Warden, and freeing Cerberus (M7)', () => {
  test('sneak behind the Mk. II, break its plating, the Warden climbs out; beat him and Cerberus goes free (Hades reunited, Poseidon arrives); E howls for Zeus, Shadow Daggers for Hades; it all survives a reload', async ({ page, consoleErrors }) => {
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
    expect(s.world!.cutscene?.id).toBe('warden-emerges');
    expect(Object.values(s.world!.entities).find((e) => e.mech)!.mech!.mode).toBe('down');

    // The scene: input is locked (arrow keys don't move the god), then the Warden fights.
    const heroId = s.world!.players.p1.entityId!;
    const before = s.world!.entities[heroId].position;
    await page.keyboard.down('ArrowUp');
    await page.evaluate(() => window.wc!.step(60));
    await page.keyboard.up('ArrowUp');
    s = await state(page);
    expect(Math.hypot(s.world!.entities[heroId].position.x - before.x, s.world!.entities[heroId].position.z - before.z)).toBeLessThan(0.3);
    await expect(page.locator('#wc-captions')).toContainText('hatch');
    await page.evaluate((n) => window.wc!.step(n), WARDEN_TICKS);
    s = await state(page);
    expect(s.world!.cutscene).toBeNull();
    expect(s.world!.objective).toBe('defeat-the-warden');
    // His boss bar.
    await expect(page.locator('[data-hud="target"].wc-boss')).toBeVisible();
    await expect(page.locator('[data-hud="target-name"]')).toHaveText('The Warden');

    // Worn down (the full fight is unit-tested); the last blows are real punches.
    await page.evaluate(() => window.wc!.weakenMech(0.01, 'warden'));
    for (let i = 0; i < 60; i += 1) {
      s = await state(page);
      const w = Object.values(s.world!.entities).find((e) => e.warden)!;
      if (w.warden!.mode === 'defeated') break;
      const god = s.world!.entities[s.world!.players.p1.entityId!];
      const d = Math.hypot(god.position.x - w.position.x, god.position.z - w.position.z) || 1;
      if (d > 2.2) {
        const x = w.position.x + ((god.position.x - w.position.x) / d) * 1.8;
        const z = w.position.z + ((god.position.z - w.position.z) / d) * 1.8;
        await page.evaluate(({ x, z, yaw }) => window.wc!.teleport(x, z, yaw), { x, z, yaw: Math.atan2(w.position.x - x, w.position.z - z) });
      }
      await page.keyboard.press('KeyA');
      await page.evaluate(() => window.wc!.step(8));
    }
    s = await state(page);
    expect(Object.values(s.world!.entities).find((e) => e.warden)!.warden!.mode).toBe('defeated');
    // A moment later the scene starts on its own: Cerberus freed, Hades reunited with him, Poseidon arrives.
    await page.evaluate(() => window.wc!.step(80));
    s = await state(page);
    expect(s.world!.cutscene?.id).toBe('cerberus-freed');
    await page.evaluate((n) => window.wc!.step(n), FREED_TICKS);
    s = await state(page);
    expect(s.world!.cutscene).toBeNull();
    expect(s.world!.flags.cerberusFreed).toBe(true);
    expect(s.world!.objective).toBe('brothers-reunited');
    expect(Object.values(s.world!.entities).some((e) => e.defId === 'poseidon' && e.npc)).toBe(true);
    // (The unlock caption queues behind the scene's lines when the test steps through it all at once; the HUD slot shows the unlock.)
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
    // Hades gets Shadow Daggers instead: three blades circle him (and his HUD slot shows them).
    await expect(page.locator('[data-hud="spirit"]')).toContainText('Shadow Daggers');
    await page.keyboard.press('KeyE');
    await page.evaluate(() => window.wc!.step(2));
    s = await state(page);
    expect(s.world!.entities[hades.id].hero!.daggers).toMatchObject({ reform: [0, 0, 0] });

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
