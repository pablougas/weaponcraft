import { DESCENT_BEATS } from '../../src/sim/cutscenes/descent';
import { expect, openGame, test, STEPS, TO_GROTTO } from './fixtures';

interface Spoken { text: string; pitch: number; rate: number; voice: string }
declare global {
  interface Window { __oscillators?: number; __noises?: number; __spoken?: Spoken[] }
}

const oscillators = (page: import('@playwright/test').Page) => page.evaluate(() => window.__oscillators ?? 0);
const noises = (page: import('@playwright/test').Page) => page.evaluate(() => window.__noises ?? 0);

test.describe('audio (M8)', () => {
  test('music plays in the meadow and the Underworld; footsteps sound; volumes are saved', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    // Count every oscillator the game starts (music notes, drones and sound effects).
    await page.addInitScript(() => {
      const original = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
        window.__oscillators = (window.__oscillators ?? 0) + 1;
        return original.call(this);
      };
      // Noise bursts are sound effects only (the music is all oscillators).
      const originalBuffer = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function patched(this: AudioContext) {
        window.__noises = (window.__noises ?? 0) + 1;
        return originalBuffer.call(this);
      };
    });
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    await expect.poll(() => page.evaluate(() => window.wc!.getState().screen)).toBe('playing');

    // The meadow's music starts after the click (real time: the render loop schedules it).
    await expect.poll(() => oscillators(page), { timeout: 20_000 }).toBeGreaterThan(4);

    // Walking on grass makes footsteps (noise bursts; the music never uses noise).
    const beforeWalk = await noises(page);
    // (Footsteps are checked once per rendered frame and SwiftShader renders slowly, so keep walking until two are heard.)
    await page.keyboard.down('ArrowUp');
    await expect.poll(async () => {
      await page.evaluate(() => window.wc!.step(5));
      return noises(page);
    }, { timeout: 30_000 }).toBeGreaterThanOrEqual(beforeWalk + 2);
    await page.keyboard.up('ArrowUp');

    // Into the Underworld: its own music keeps playing there.
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    await page.evaluate((n) => window.wc!.step(n), TO_GROTTO);
    await expect(page.locator('#wc-hud')).toBeVisible({ timeout: 20_000 });
    const underworld = await oscillators(page);
    await expect.poll(() => oscillators(page), { timeout: 20_000 }).toBeGreaterThan(underworld + 3);

    // Volume sliders in the Esc menu are saved in this browser.
    await page.keyboard.press('Escape');
    await expect(page.locator('#wc-settings')).toBeVisible();
    await page.locator('[data-volume="music"]').fill('0.25');
    await page.locator('[data-volume="sfx"]').fill('0.5');
    await expect(page.locator('[data-volume-output="music"]')).toHaveText('25%');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('weaponcraft:settings:v1') ?? '{}'));
    expect(saved.volume).toMatchObject({ music: 0.25, sfx: 0.5 });
    expect(consoleErrors).toEqual([]);
  });

  test('the gods speak their lines: each with his own voice, on-device voices only, under the captions', async ({ page, consoleErrors }) => {
    test.setTimeout(120_000);
    // A stand-in speech engine with one network voice and one on-device voice; record what is said.
    await page.addInitScript(() => {
      window.__spoken = [];
      class FakeUtterance {
        text: string; pitch = 1; rate = 1; volume = 1; lang = ''; voice: { name: string } | null = null;
        onend: (() => void) | null = null; onerror: (() => void) | null = null;
        constructor(text: string) { this.text = text; }
      }
      (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;
      const voices = [
        { name: 'Google UK English Male', lang: 'en-GB', localService: false, default: false, voiceURI: 'g' },
        { name: 'Daniel', lang: 'en-GB', localService: true, default: false, voiceURI: 'd' },
      ];
      const synth = window.speechSynthesis;
      synth.getVoices = () => voices as unknown as SpeechSynthesisVoice[];
      synth.cancel = () => undefined;
      synth.speak = (u: SpeechSynthesisUtterance) => {
        const f = u as unknown as FakeUtterance;
        window.__spoken!.push({ text: f.text, pitch: f.pitch, rate: f.rate, voice: f.voice?.name ?? '' });
        setTimeout(() => f.onend?.(), 50);
      };
    });
    await openGame(page);
    await page.evaluate(() => window.wc!.setSeed(7));
    await page.locator('#wc-title').click();
    for (const step of STEPS) await page.evaluate((s) => window.wc!.completeTutorialStep(s), step);
    // Into the descent, just past Hades's first line.
    await page.evaluate((n) => window.wc!.step(n), 541 + DESCENT_BEATS.lineHades1 + 2);
    await expect(page.locator('#wc-captions')).toContainText('Hades: Brother.');
    await expect.poll(() => page.evaluate(() => window.__spoken!.length)).toBeGreaterThan(0);
    const hades = (await page.evaluate(() => window.__spoken!))[0];
    expect(hades).toMatchObject({ text: expect.stringContaining('Olympus has fallen'), voice: 'Daniel', pitch: 0.5, rate: 0.8 });
    // Zeus answers in his own, higher voice.
    await page.evaluate((n) => window.wc!.step(n), DESCENT_BEATS.lineZeus - DESCENT_BEATS.lineHades1);
    await expect.poll(() => page.evaluate(() => window.__spoken!.map((s) => s.text)), { timeout: 20_000 }).toContain('They will answer for this.');
    const zeus = (await page.evaluate(() => window.__spoken!)).find((s) => s.text.startsWith('They will'))!;
    expect(zeus.pitch).toBeGreaterThan(hades.pitch);
    // The Esc menu has a Voices volume.
    await page.evaluate(() => window.wc!.step(1));
    expect(await page.locator('[data-volume="voice"]').count()).toBe(1);
    expect(consoleErrors).toEqual([]);
  });
});
