import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve('.');

test('package metadata is updated for clawpacker npm publishing readiness', async () => {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));

  assert.equal(pkg.name, '@cogineai/clawpacker');
  assert.equal(pkg.bin.clawpacker, 'dist/cli.js');
  assert.equal(pkg.scripts.prepublishOnly, 'npm run build && npm test');
  assert.deepEqual(pkg.repository, {
    type: 'git',
    url: 'git+https://github.com/cogine-ai/clawpack.git',
  });
  assert.equal(pkg.homepage, 'https://github.com/cogine-ai/clawpack');
  assert.equal(pkg.bugs, 'https://github.com/cogine-ai/clawpack/issues');
  assert.equal(pkg.license, 'MIT');
  assert.deepEqual(pkg.files, ['dist', 'README.md', 'LICENSE']);
  assert.equal(pkg.private, undefined);
});

test('CLI help and README use clawpacker branding', async () => {
  const readme = await readFile(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(readme, /^# Clawpacker/m);
  assert.match(readme, /\bclawpacker\b/);
  assert.doesNotMatch(readme, /\bClawport\b/);
  assert.doesNotMatch(readme, /openclaw-agent-package/);

  const cliSource = await readFile(path.join(projectRoot, 'src/cli.ts'), 'utf8');
  assert.match(cliSource, /\.name\('clawpacker'\)/);
  assert.match(cliSource, /portable OpenClaw agent\/workspace templates/i);
  assert.doesNotMatch(cliSource, /clawport/i);
});
