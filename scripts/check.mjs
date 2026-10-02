import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
let failures = 0, checked = 0;
for (const file of ['bin', 'lib', 'scripts', 'test'].flatMap(dir => walk(path.join(root, dir)))) {
  const command = file.endsWith('.mjs') ? [process.execPath, ['--check', file]] : file.endsWith('.sh') ? ['bash', ['-n', file]] : null;
  if (!command) continue;
  const result = spawnSync(command[0], command[1], { encoding: 'utf8' }); checked++;
  if (result.status !== 0) { failures++; console.error(result.stderr || result.error); }
}
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
if (Object.keys(manifest.dependencies ?? {}).length || Object.keys(manifest.devDependencies ?? {}).length) { failures++; console.error('Package dependencies must remain empty'); }
console.log(`${checked} syntax checks; ${failures} failures; no npm dependencies`);
process.exitCode = failures ? 1 : 0;
