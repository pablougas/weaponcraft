import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { packageGame } from '../scripts/package-game.mjs';

test('packages the built page with index.html at the archive root', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'weaponcraft-package-'));
  const build = join(temporary, 'dist');
  const output = join(temporary, 'artifacts', 'game.zip');

  try {
    await mkdir(join(build, 'assets'), { recursive: true });
    await writeFile(join(build, 'index.html'), '<main>game</main>');
    await writeFile(join(build, 'assets', 'game.js'), 'export {};');

    const result = await packageGame(build, output);
    const archive = unzipSync(await readFile(output));

    assert.deepEqual(result.files.sort(), ['assets/game.js', 'index.html']);
    assert.equal(new TextDecoder().decode(archive['index.html']), '<main>game</main>');
    assert.ok(archive['assets/game.js']);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('refuses to create a game archive without a root index.html', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'weaponcraft-package-'));

  try {
    await assert.rejects(
      packageGame(temporary, join(temporary, 'artifacts', 'game.zip')),
      /index\.html at the ZIP root/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
