import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

let missing = false;

for (const [tool, args] of [
  ['node', ['--version']],
  ['npm', ['--version']],
  ['git', ['--version']],
]) {
  const result = spawnSync(tool, args, { encoding: 'utf8', timeout: 20000 });
  const ok = result.status === 0;
  console.log(`${ok ? 'OK' : 'MISSING'} ${tool}: ${ok ? result.stdout.trim().split('\n')[0] : 'not available'}`);
  if (!ok) missing = true;
}

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.log('MISSING Node.js 22.12+: this project requires Node 22.12 or newer.');
  missing = true;
}

for (const dependency of ['phaser', 'three', 'typescript', 'vite', 'fflate']) {
  if (!existsSync(`node_modules/${dependency}`)) {
    console.log(`MISSING ${dependency}: run npm ci`);
    missing = true;
  }
}

console.log('\nNext: npm run dev, then open port 5173. AI tools are optional and use your own accounts.');
process.exitCode = Number(missing);
