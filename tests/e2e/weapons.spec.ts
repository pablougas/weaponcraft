import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const hero = (s: State) => s.world!.entities[s.world!.players[s.localPlayerId!].entityId!];

test.describe('weapons and fusion (M4)', () => {
  test('?preview=weapons shows every weapon as a contact sheet', async ({ page, consoleErrors }) => {
    await page.goto('/?preview=weapons');
    await expect(page.locator('body[data-ready="true"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('.wc-preview-card')).toHaveCount(15);
    // Approved: the starter spear, the three meadow weapons, their three legendaries and Hades’s bident.
    await expect(page.locator('.wc-preview-card.wc-unapproved')).toHaveCount(7);
    const renders = await page.locator('[data-render]').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src.startsWith('data:image/png')));
    expect(renders.every(Boolean)).toBe(true);
    await mkdir('artifacts/previews', { recursive: true });
    await page.screenshot({ path: 'artifacts/previews/weapons.png', fullPage: true });
    expect(consoleErrors).toEqual([]);
  });

  test('pick up a weapon, fuse a known pair at the altar: named legendary + codex entry', { tag: '@smoke' }, async ({ page, consoleErrors }) => {
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    await expect(page.locator('#wc-title')).toHaveCount(0);

    // Nothing in reach on the rock: no prompt at all (not even an empty box).
    await expect(page.locator('.wc-prompt')).toBeHidden();
    // The Sunlit Blade lies in the meadow, east of the rock.
    await page.evaluate(() => window.wc!.teleport(12.8, 7));
    await expect(page.locator('.wc-prompt')).toContainText('Pick up Sunlit Blade');
    // The prompt is a fixed hint on the right of the screen, not over the item.
    const box = (await page.locator('.wc-prompt').boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1280 - 60);
    expect(box.x).toBeGreaterThan(1280 / 2);
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await state(page)).world!.players[(await state(page)).localPlayerId!].inventory).toEqual(['starter-spear', 'sunlit-sword']);

    // Picked up: nothing left in reach, so the prompt goes away.
    await expect(page.locator('.wc-prompt')).toBeHidden();
    // F at the Fusion Altar opens it.
    await page.evaluate(() => window.wc!.teleport(6.5, 3));
    await page.keyboard.press('KeyF');
    const altar = page.locator('#wc-altar');
    await expect(altar).toBeVisible();
    await altar.locator('[data-slot="0"]').click();
    await altar.locator('[data-slot="1"]').click();
    await altar.locator('[data-action="fuse"]').click();
    await expect(altar).toContainText('A legendary weapon is born!');
    await expect(altar).toContainText('Dawnbringer');

    const s = await state(page);
    // Fused by Zeus, the Light legendary keeps his power: Lightning.
    expect(s.world!.players[s.localPlayerId!].inventory).toEqual(['dawnbringer@lightning']);
    expect(hero(s).hero!.weaponId).toBe('dawnbringer@lightning');
    expect(s.world!.customWeapons['dawnbringer@lightning']).toMatchObject({ element: 'lightning' });
    expect(s.world!.codex['starter-spear+sunlit-sword']).toMatchObject({ resultId: 'dawnbringer@lightning', legendary: true });

    await altar.locator('[data-action="close"]').first().click();
    // Walking away from the altar removes "F Use Fusion Altar".
    await expect(page.locator('.wc-prompt')).toContainText('Use Fusion Altar');
    await page.evaluate(() => window.wc!.teleport(-20, -20));
    await expect(page.locator('.wc-prompt')).toBeHidden();
    await page.keyboard.press('KeyC');
    await expect(page.locator('#wc-codex')).toContainText('1 / 6');
    await expect(page.locator('#wc-codex')).toContainText('Dawnbringer');
    await page.keyboard.press('KeyC');
    await expect(page.locator('#wc-codex')).toBeHidden();
    expect(consoleErrors).toEqual([]);
  });

  test('I opens the inventory and Equip switches weapons', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    await page.evaluate(() => window.wc!.teleport(-8.2, 14));
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await state(page)).world!.players[(await state(page)).localPlayerId!].inventory.length).toBe(2);
    await page.keyboard.press('KeyI');
    const inventory = page.locator('#wc-inventory');
    await expect(inventory).toBeVisible();
    await inventory.locator('[data-slot="1"]').click();
    await expect(inventory).toContainText('Storm-Iron Axe');
    await inventory.locator('[data-action="equip"]').click();
    await expect.poll(async () => hero(await state(page)).hero!.weaponId).toBe('storm-axe');
    await expect(page.locator('[data-hud="weapon-name"]')).toHaveText('Storm-Iron Axe');
    await page.keyboard.press('Escape');
    await expect(inventory).toBeHidden();
    await expect(page.locator('#wc-settings')).toBeHidden();
  });

  test('the element wheel doubles damage: lightning on the Light dummy shows "Weak!"', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    // Stand right next to the Light dummy (5.5, 8.5) so Chain Lightning starts there.
    await page.evaluate(() => window.wc!.teleport(5.5, 6.8, 0));
    await page.keyboard.press('KeyQ');
    await expect(page.locator('.wc-damage.wc-super').first()).toBeAttached({ timeout: 20_000 });
  });
});
