import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

type State = Awaited<ReturnType<NonNullable<typeof window.wc>['getState']>>;
const state = (page: Page): Promise<State> => page.evaluate(() => window.wc!.getState());
const STEPS = ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse'];

async function inGrotto(page: Page) {
  await openGame(page);
  await page.evaluate(() => window.wc!.setSeed(7));
  await page.locator('#wc-title').click();
  for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
  await page.evaluate(() => window.wc!.step(541 + 905));
  await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
}

test.describe('the Underworld route (M6)', () => {
  test('break the barricade, cross the fields: a sentry raises the alarm, soldiers attack; the map reveal survives a reload', async ({ page, consoleErrors }) => {
    test.setTimeout(240_000);
    await inGrotto(page);
    await expect(page.locator('#wc-minimap')).toBeVisible();

    // Punch the barricade down (A, real input).
    await page.evaluate(() => window.wc!.teleport(0, -16.6, Math.PI));
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press('KeyA');
      await page.evaluate(() => window.wc!.step(12));
      if ((await state(page)).world!.flags.barricadeBroken) break;
    }
    expect((await state(page)).world!.flags.barricadeBroken).toBe(true);

    // 12 m in front of the first sentry squad's leader: it sounds the horn and the squad attacks.
    let s = await state(page);
    const leader = Object.values(s.world!.entities).find((e) => e.soldier?.squadId === 'squad-approach' && e.soldier.leader)!;
    const f = leader.soldier!.facing;
    await page.evaluate(({ x, z, yaw }) => window.wc!.teleport(x, z, yaw), {
      x: leader.position.x + Math.sin(f) * 12, z: leader.position.z + Math.cos(f) * 12, yaw: f + Math.PI,
    });
    await page.evaluate(() => window.wc!.step(120));
    s = await state(page);
    const squad = Object.values(s.world!.entities).filter((e) => e.soldier?.squadId === 'squad-approach');
    expect(squad.find((e) => e.id === leader.id)!.soldier!.awareness).toBeGreaterThanOrEqual(60);
    expect(squad.every((e) => e.soldier!.state === 'attack')).toBe(true);

    // Stand at the first fort's gate: its soldiers notice and attack.
    // Just inside the first fort's gate (it faces the path, east): its soldiers notice and attack.
    const chest = Object.values(s.world!.entities).find((e) => e.structure?.kind === 'chest' && e.fortId === 'fort-asphodel')!;
    const fort = { x: chest.position.x, z: chest.position.z + 3 };
    await page.evaluate((f) => window.wc!.teleport(f.x + 12, f.z, -Math.PI / 2), fort);
    await page.evaluate(() => window.wc!.step(150));
    s = await state(page);
    const fortSoldiers = Object.values(s.world!.entities).filter((e) => e.soldier?.fortId === 'fort-asphodel');
    expect(fortSoldiers.some((e) => e.soldier!.state === 'attack')).toBe(true);
    expect(s.world!.forts['fort-asphodel'].seen).toBe(true);

    // M opens the full map.
    await page.keyboard.press('KeyM');
    await expect(page.locator('#wc-minimap.wc-map-full')).toBeVisible();
    await page.keyboard.press('KeyM');

    const revealed = s.world!.reveal.underworld!;
    await page.reload();
    await page.waitForFunction(() => window.wc !== undefined);
    await page.evaluate(() => window.wc!.ready());
    s = await state(page);
    // The clock runs until the save, so a cell or two more may be revealed; none may be lost.
    const after = s.world!.reveal.underworld!;
    expect(after.length).toBe(revealed.length);
    expect([...revealed].filter((c, i) => c === '1' && after[i] !== '1')).toEqual([]);
    expect(revealed).toContain('1');
    expect(s.world!.flags.barricadeBroken).toBe(true);
    expect(consoleErrors).toEqual([]);
  });
});
