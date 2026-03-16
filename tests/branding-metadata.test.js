const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFile } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve('.');

test('package metadata is updated for clawpack GitHub publishing readiness', async () => {
  const pkg = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));

  assert.equal(pkg.name, 'clawpack');
  assert.equal(pkg.bin.clawpack, 'dist/cli.js');
  assert.equal(pkg.repository, 'https://github.com/cogine-ai/clawpack');
  assert.equal(pkg.homepage, 'https://github.com/cogine-ai/clawpack');
  assert.equal(pkg.bugs, 'https://github.com/cogine-ai/clawpack/issues');
  assert.equal(pkg.license, 'UNLICENSED');
});

test('CLI help and README use clawpack branding', async () => {
  const readme = await readFile(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(readme, /^# Clawpack/m);
  assert.match(readme, /\bclawpack\b/);
  assert.doesNotMatch(readme, /\bClawport\b/);
  assert.doesNotMatch(readme, /openclaw-agent-package/);

  const { stdout } = await execFileAsync('node', ['dist/cli.js', '--help'], { cwd: projectRoot });
  assert.match(stdout, /Usage: clawpack/);
  assert.match(stdout, /portable OpenClaw agent\/workspace templates/i);
  assert.doesNotMatch(stdout, /clawport/);
});
