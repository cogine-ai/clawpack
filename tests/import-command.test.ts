import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const fixtureConfig = path.resolve('tests/fixtures/openclaw-config/source-config.jsonc');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
const blockedPackageRoot = path.resolve('tests/tmp/import-command-blocked-fixture.ocpkg');
const blockedTargetRoot = path.resolve('tests/tmp/import-command-blocked-target');
const execFileAsync = promisify(execFile);

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: path.resolve('.'),
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
}

async function prepareBlockedImportFixture() {
  await rm(blockedPackageRoot, { recursive: true, force: true });
  await rm(blockedTargetRoot, { recursive: true, force: true });

  await runCli([
    'export',
    '--workspace', fixtureWorkspace,
    '--config', fixtureConfig,
    '--agent-id', 'supercoder',
    '--out', blockedPackageRoot,
  ]);
}

async function runCliFailure(args: string[]) {
  try {
    await runCli(args);
    assert.fail(`Expected CLI invocation to fail: ${args.join(' ')}`);
  } catch (error) {
    return error as NodeJS.ErrnoException & { stdout: string; stderr: string; code: number };
  }
}

test('blocked import prints clean human-readable output and exits non-zero', async () => {
  await prepareBlockedImportFixture();

  const error = await runCliFailure([
    'import',
    blockedPackageRoot,
    '--target-workspace', blockedTargetRoot,
  ]);

  assert.equal(error.code, 1);
  assert.equal(error.stdout, '');
  assert.match(error.stderr, /^Import blocked/m);
  assert.match(error.stderr, /Required inputs:/);
  assert.match(error.stderr, /Choose a target agent id for the imported definition\./);
  assert.doesNotMatch(error.stderr, /^Error:/m);
  assert.doesNotMatch(error.stderr, /at Command\.runImport/);
  assert.doesNotMatch(error.stderr, /"status": "blocked"/);
});

test('blocked import with --json prints clean JSON to stderr and exits non-zero', async () => {
  await prepareBlockedImportFixture();

  const error = await runCliFailure([
    'import',
    blockedPackageRoot,
    '--target-workspace', blockedTargetRoot,
    '--json',
  ]);

  assert.equal(error.code, 1);
  assert.equal(error.stdout, '');
  assert.doesNotMatch(error.stderr, /^Error:/m);
  assert.doesNotMatch(error.stderr, /at Command\.runImport/);

  const report = JSON.parse(error.stderr);
  assert.equal(report.status, 'blocked');
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.requiredInputs.map((item: { key: string }) => item.key), ['agentId']);
  assert.ok(report.warnings.some((warning: string) => warning.includes('Channel bindings')));
  assert.ok(report.nextSteps.some((step: string) => step.includes('Review the imported identity and memory files')));
  assert.equal(report.writePlan.targetWorkspacePath, blockedTargetRoot);
});
