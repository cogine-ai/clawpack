const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { readFile, rm } = require('node:fs/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const fixture = path.resolve('tests/fixtures/source-workspace');
const packageRoot = path.resolve('tests/tmp/validate-fixture.ocpkg');
const targetRoot = path.resolve('tests/tmp/validate-target/workspace-supercoder-copy');

async function exportAndImport() {
  await rm(packageRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });

  await execFileAsync('node', ['dist/cli.js', 'export', '--workspace', fixture, '--out', packageRoot]);
  await execFileAsync('node', ['dist/cli.js', 'import', packageRoot, '--target-workspace', targetRoot, '--agent-id', 'supercoder-copy']);
}

test('validate command reports passed warnings failed and nextSteps', async () => {
  await exportAndImport();

  const { stdout } = await execFileAsync('node', ['dist/cli.js', 'validate', '--target-workspace', targetRoot, '--agent-id', 'supercoder-copy']);
  const report = JSON.parse(stdout);

  assert.equal(Array.isArray(report.passed), true);
  assert.equal(Array.isArray(report.warnings), true);
  assert.equal(Array.isArray(report.failed), true);
  assert.equal(Array.isArray(report.nextSteps), true);
  assert.equal(report.failed.length, 0);
  assert.ok(report.warnings.some((warning) => warning.includes('Skills are manifest-only')));
  assert.ok(report.nextSteps.some((step) => step.includes('Channel bindings')));
  assert.equal(existsSync(path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json')), true);

  const record = JSON.parse(await readFile(path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json'), 'utf8'));
  assert.equal(record.agentId, 'supercoder-copy');
});

test('validate reports target config consistency when config path is provided', async () => {
  await exportAndImport();
  const configRoot = path.resolve('tests/tmp/validate-config');
  const configPath = path.join(configRoot, 'openclaw-config.json');
  await rm(configRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });
  await exportAndImport();

  await require('node:fs/promises').mkdir(configRoot, { recursive: true });
  await require('node:fs/promises').writeFile(configPath, JSON.stringify({
    agents: {
      'supercoder-copy': {
        id: 'supercoder-copy',
        name: 'Supercoder',
        workspace: targetRoot
      }
    }
  }, null, 2));

  const { stdout } = await execFileAsync('node', [
    'dist/cli.js', 'validate',
    '--target-workspace', targetRoot,
    '--agent-id', 'supercoder-copy',
    '--config', configPath,
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.failed.length, 0);
  assert.ok(report.passed.some((entry) => entry.includes('OpenClaw config agent present')));
  assert.ok(report.passed.some((entry) => entry.includes('workspace matches')));

  await require('node:fs/promises').writeFile(configPath, JSON.stringify({
    agents: {
      'supercoder-copy': {
        id: 'supercoder-copy',
        name: 'Supercoder',
        workspace: '/tmp/wrong-workspace'
      }
    }
  }, null, 2));

  const mismatch = await execFileAsync('node', [
    'dist/cli.js', 'validate',
    '--target-workspace', targetRoot,
    '--agent-id', 'supercoder-copy',
    '--config', configPath,
  ]);
  const mismatchReport = JSON.parse(mismatch.stdout);
  assert.ok(mismatchReport.failed.some((entry) => entry.includes('workspace mismatch')));
});

test('validate reports missing required workspace files as failures', async () => {
  await exportAndImport();
  await rm(path.join(targetRoot, 'AGENTS.md'), { force: true });

  const { stdout } = await execFileAsync('node', ['dist/cli.js', 'validate', '--target-workspace', targetRoot, '--agent-id', 'supercoder-copy']);
  const report = JSON.parse(stdout);

  assert.ok(report.failed.some((failure) => failure.includes('AGENTS.md')));
});
