const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { readFile, rm } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readPackageDirectory } = require('../dist/core/package-read.js');

const execFileAsync = promisify(execFile);
const fixture = path.resolve('tests/fixtures/source-workspace');
const outputRoot = path.resolve('tests/tmp/exported-fixture.ocpkg');
const targetRoot = path.resolve('tests/tmp/roundtrip-target/workspace-supercoder-copy');

test('export command writes package directory structure and excludes daily memory', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await execFileAsync('node', ['dist/cli.js', 'export', '--workspace', fixture, '--out', outputRoot]);

  for (const requiredPath of [
    'manifest.json',
    'config/skills-manifest.json',
    'config/agent.json',
    'meta/checksums.json',
    'meta/export-report.json',
    'workspace/AGENTS.md',
    'workspace/MEMORY.md',
  ]) {
    assert.equal(existsSync(path.join(outputRoot, requiredPath)), true, `${requiredPath} should exist`);
  }

  assert.equal(existsSync(path.join(outputRoot, 'workspace', 'memory', '2026-03-16.md')), false);

  const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.includes.skills, 'manifest-only');
});

test('package reader opens a valid exported package and verifies checksums', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await execFileAsync('node', ['dist/cli.js', 'export', '--workspace', fixture, '--out', outputRoot]);

  const pkg = await readPackageDirectory(outputRoot);
  assert.equal(pkg.manifest.packageType, 'openclaw-agent-template');
  assert.equal(pkg.workspaceFiles.length >= 6, true);
  assert.equal(pkg.checksums['config/agent.json'].length, 64);
});

test('roundtrip export -> import -> validate succeeds with expected warnings', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });

  await execFileAsync('node', ['dist/cli.js', 'export', '--workspace', fixture, '--out', outputRoot]);
  await execFileAsync('node', ['dist/cli.js', 'import', outputRoot, '--target-workspace', targetRoot, '--agent-id', 'supercoder-copy']);
  const { stdout } = await execFileAsync('node', ['dist/cli.js', 'validate', '--target-workspace', targetRoot, '--agent-id', 'supercoder-copy']);

  const report = JSON.parse(stdout);
  assert.equal(report.failed.length, 0);
  assert.ok(report.warnings.some((warning) => warning.includes('Skills are manifest-only')));
  assert.ok(report.nextSteps.some((step) => step.includes('Channel bindings')));
  assert.equal(existsSync(path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json')), true);
});
