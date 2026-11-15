import type { Page } from '@playwright/test';
import { expect, openGame, test } from './fixtures';

// Approved screenshots are how a look gets signed off (CLAUDE.md). If one of
// these fails after an intended change, show the team `npx playwright
// show-report` and run `npm run test:visual:update` only once they approve.

test.describe.configure({ timeout: 180_000 });

// Software WebGL renders the meadow slowly; give each screenshot time to settle.
const SHOT = { timeout: 60_000 };

type Camera = 'vista' | 'hero' | 'wide' | 'yard' | 'follow';

/**
 * Starts the game, freezes the clock, and starts a fresh world from a fixed
 * seed so every frame is identical. The HUD is hidden unless `hud` is set
 * (CLAUDE.md: baselines show the HUD only when the HUD is under test).
 * Camera 'follow' keeps the in-game camera behind Zeus.
 */
async function frozenScene(page: Page, dayFraction: number, camera: Camera = 'vista', { hud = false } = {}) {
  await openGame(page);
  await page.locator('#wc-title').click();
  await expect(page.locator('#wc-title, #wc-loading')).toHaveCount(0);
  if (!hud) await page.addStyleTag({ content: '#wc-hud, #wc-labels, #wc-tutorial, #wc-captions, #wc-skip, #wc-minimap { display: none !important; }' });
  await page.evaluate(async ({ dayFraction, camera }) => {
    await window.wc!.freeze(12);
    await window.wc!.setSeed(7);
    await window.wc!.setTime(dayFraction);
    if (camera !== 'follow') await window.wc!.snapCam(camera);
  }, { dayFraction, camera });
}

test.describe('the look (M2)', { tag: '@visual' }, () => {
  for (const [name, dayFraction] of [
    ['golden', 0.7],
    ['dusk', 0.77],
    ['night', 0.92],
    ['dawn', 0.25],
    ['noon', 0.5],
  ] as const) {
    test(`vista at ${name}`, async ({ page }) => {
      await frozenScene(page, dayFraction);
      await expect(page).toHaveScreenshot(`vista-${name}.png`, SHOT);
    });
  }

  test('wide shot at golden hour', async ({ page }) => {
    await frozenScene(page, 0.7, 'wide');
    await expect(page).toHaveScreenshot('wide-golden.png', SHOT);
  });

  test('every effect off at golden hour', async ({ page }) => {
    await frozenScene(page, 0.7);
    await page.keyboard.press('Escape');
    const menu = page.locator('#wc-settings');
    await expect(menu).toBeVisible();
    for (const name of ['Bloom', 'God rays', 'Outlines', 'Color grade', 'Particles']) {
      await menu.getByLabel(name).uncheck();
    }
    await menu.getByRole('button', { name: 'Resume' }).click();
    await expect(menu).toBeHidden();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('vista-golden-effects-off.png', SHOT);
  });

  test('settings menu', async ({ page }) => {
    await frozenScene(page, 0.7);
    await page.keyboard.press('Escape');
    await expect(page.locator('#wc-settings')).toBeVisible();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('settings-menu.png', SHOT);
  });

  for (const expression of ['neutral', 'determined', 'happy', 'hurt'] as const) {
    test(`Zeus close-up, ${expression}`, async ({ page }) => {
      await frozenScene(page, 0.7, 'hero');
      await page.evaluate((e) => window.wc!.face(e), expression);
      await expect(page).toHaveScreenshot(`zeus-${expression}.png`, SHOT);
    });
  }

  test('in-game camera with the HUD', async ({ page }) => {
    await frozenScene(page, 0.7, 'follow', { hud: true });
    await expect(page.locator('#wc-hud')).toBeVisible();
    await expect(page).toHaveScreenshot('hud.png', SHOT);
  });

  test('practice yard: dummies and sheep', async ({ page }) => {
    await frozenScene(page, 0.7, 'yard');
    await expect(page).toHaveScreenshot('yard.png', SHOT);
  });

  /** Walks Zeus to (x, z) and presses F there (frozen clock: the sim only moves on wc.step). */
  async function pickUpAt(page: Page, x: number, z: number) {
    await page.evaluate(([px, pz]) => window.wc!.teleport(px, pz), [x, z]);
    await page.keyboard.press('KeyF');
    await page.evaluate(() => window.wc!.step(1));
  }

  test('inventory screen', async ({ page }) => {
    await frozenScene(page, 0.7, 'follow');
    await pickUpAt(page, 12.8, 7);
    await pickUpAt(page, -8.2, 14);
    await page.keyboard.press('KeyI');
    await expect(page.locator('#wc-inventory')).toBeVisible();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('inventory.png', SHOT);
  });

  test('Fusion Altar screen with a pair chosen', async ({ page }) => {
    await frozenScene(page, 0.7, 'follow');
    await pickUpAt(page, 12.8, 7);
    await pickUpAt(page, 6.5, 3);
    await expect(page.locator('#wc-altar')).toBeVisible();
    await page.locator('#wc-altar [data-slot="0"]').click();
    await page.locator('#wc-altar [data-slot="1"]').click();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('fusion-altar.png', SHOT);
  });

  test('Fusion Codex with one legendary found', async ({ page }) => {
    await frozenScene(page, 0.7, 'follow');
    await pickUpAt(page, 12.8, 7);
    await pickUpAt(page, 6.5, 3);
    await page.locator('#wc-altar [data-slot="0"]').click();
    await page.locator('#wc-altar [data-slot="1"]').click();
    await page.locator('#wc-altar [data-action="fuse"]').click();
    await page.evaluate(() => window.wc!.step(1));
    await page.locator('#wc-altar [data-action="close"]').first().click();
    await page.keyboard.press('KeyC');
    await expect(page.locator('#wc-codex')).toBeVisible();
    await page.evaluate(() => window.wc!.freeze(12));
    await expect(page).toHaveScreenshot('codex.png', SHOT);
  });

  /** Completes the tutorial and steps the (frozen) rocket cinematic to `ticks` after it starts. */
  async function cinematicAt(page: Page, ticks: number) {
    await frozenScene(page, 0.7, 'follow');
    for (const step of ['move', 'sprint', 'jump', 'attack', 'ability', 'pickup', 'fuse']) {
      await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    }
    await page.evaluate(async (n) => { window.wc!.step(n); await window.wc!.freeze(12); }, ticks);
  }

  for (const [name, ticks] of [['rocket', 105], ['impact', 186], ['pan', 400]] as const) {
    test(`rocket cinematic: ${name}`, async ({ page }) => {
      await cinematicAt(page, ticks);
      await expect(page).toHaveScreenshot(`cinematic-${name}.png`, SHOT);
    });
  }

  test('the shattered summit after the rocket', async ({ page }) => {
    await cinematicAt(page, 541); // the rocket's last tick; the descent starts with the portal still closed
    await page.evaluate(async () => { await window.wc!.setTime(0.7); await window.wc!.snapCam('vista'); });
    await expect(page).toHaveScreenshot('vista-shattered.png', SHOT);
  });

  // M5.1: Hades's arrival, the portal down, and the grotto (ticks after the rocket starts; it lasts 540).
  for (const [name, ticks] of [['hades-arrival', 541 + 140], ['hades-portal', 541 + 470], ['grotto-discovery', 541 + 735]] as const) {
    test(`descent: ${name}`, async ({ page }) => {
      await cinematicAt(page, ticks);
      await expect(page).toHaveScreenshot(`${name}.png`, SHOT);
    });
  }

  test('the Outer Grotto as the Refuge', async ({ page }) => {
    await cinematicAt(page, 541 + 905);
    await expect(page).toHaveScreenshot('grotto-refuge.png', SHOT);
  });

  test('resting on the grotto bed', async ({ page }) => {
    await cinematicAt(page, 541 + 905);
    // Stand beside the bed (grotto spot 7.5, 4; the grotto is 2 km down) and press F.
    await page.evaluate(() => window.wc!.teleport(7.5 - 1.6, 4 - 0.9));
    await page.keyboard.press('KeyF');
    await page.evaluate(async () => { window.wc!.step(31); await window.wc!.freeze(12); });
    await expect(page).toHaveScreenshot('grotto-resting.png', SHOT);
  });

  for (const expression of ['neutral', 'determined', 'happy', 'hurt'] as const) {
    test(`Hades close-up, ${expression}`, async ({ page }) => {
      await cinematicAt(page, 541 + 905);
      await page.keyboard.press('KeyV');
      await page.evaluate(async (e) => { window.wc!.step(2); await window.wc!.freeze(12); await window.wc!.snapCam('closeup'); await window.wc!.face(e); }, expression);
      await expect(page).toHaveScreenshot(`hades-${expression}.png`, SHOT);
    });
  }

  test('the barricade torn down: the tunnel to the Asphodel Fields', async ({ page }) => {
    await cinematicAt(page, 541 + 905);
    await page.evaluate(async () => {
      await window.wc!.breakBarricade();
      await window.wc!.teleport(0, -9, Math.PI);
      window.wc!.step(20);
      await window.wc!.freeze(12);
    });
    await expect(page).toHaveScreenshot('grotto-tunnel-open.png', SHOT);
  });

  test('the Asphodel Fields vista toward the Gates', async ({ page }) => {
    await cinematicAt(page, 541 + 905);
    await page.evaluate(async () => {
      await window.wc!.teleport(-2, -95, Math.PI);
      window.wc!.step(90);
      await window.wc!.freeze(12);
    });
    await expect(page).toHaveScreenshot('asphodel-fields.png', SHOT);
  });

  test('a human fort in the Asphodel Fields', async ({ page }) => {
    await cinematicAt(page, 541 + 905);
    // Outside the first fort's gate, looking in (fort-asphodel sits west of the path at z −185).
    await page.evaluate(async () => {
      await window.wc!.teleport(-4, -160, Math.PI + 0.75);
      window.wc!.step(2);
      await window.wc!.freeze(12);
      await window.wc!.snapCam('overlook');
    });
    await expect(page).toHaveScreenshot('fort.png', SHOT);
  });

  // Behind-left of a sentry squad's leader, out of its cone, looking at the squad.
  async function behindSquad(page: Page, squadId: string) {
    await cinematicAt(page, 541 + 905);
    await page.evaluate(async (id) => {
      const w = window.wc!.getState().world!;
      const leader = Object.values(w.entities).find((e) => e.soldier?.squadId === id && e.soldier.leader)!;
      const f = leader.soldier!.facing;
      const x = leader.position.x - Math.sin(f) * 11 + Math.cos(f) * 5;
      const z = leader.position.z - Math.cos(f) * 11 - Math.sin(f) * 5;
      await window.wc!.teleport(x, z, Math.atan2(leader.position.x - x, leader.position.z - z));
      window.wc!.step(2);
      await window.wc!.freeze(12);
      await window.wc!.snapCam('overlook');
    }, squadId);
  }

  test('a sentry squad and its leader’s sight cone', async ({ page }) => {
    await behindSquad(page, 'squad-approach');
    await expect(page).toHaveScreenshot('sentry-cone.png', SHOT);
  });

  test('a squad led by a Sentry Captain', async ({ page }) => {
    await behindSquad(page, 'squad-river');
    await expect(page).toHaveScreenshot('sentry-captain.png', SHOT);
  });
});
