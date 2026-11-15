import { mkdir } from 'node:fs/promises';
import { expect, test } from './fixtures';

test.describe('characters preview (Hades model)', () => {
  test('?preview=characters renders Zeus and Hades from three angles with every face', async ({ page, consoleErrors }) => {
    test.setTimeout(180_000);
    await page.goto('/?preview=characters');
    await expect(page.locator('body[data-ready="true"]')).toHaveCount(1, { timeout: 150_000 });
    await expect(page.locator('.wc-preview-character')).toHaveCount(2);
    // Hades stays unapproved until the team signs off the in-game model.
    await expect(page.locator('[data-character="hades"] .wc-pending')).toHaveCount(1);
    // 3 angles + 4 faces per character, all rendered.
    const renders = await page.locator('img[data-render]').evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src.startsWith('data:image/png')));
    expect(renders).toHaveLength(14);
    expect(renders.every(Boolean)).toBe(true);
    await mkdir('artifacts/previews', { recursive: true });
    await page.screenshot({ path: 'artifacts/previews/characters.png', fullPage: true });
    expect(consoleErrors).toEqual([]);
  });
});
