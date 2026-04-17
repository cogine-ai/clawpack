import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const fixtureConfig = path.resolve('tests/fixtures/openclaw-config/source-config.jsonc');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
const blockedPackageRoot = path.resolve('tests/tmp/import-command-blocked-fixture.ocpkg');
const blockedTargetRoot = path.resolve('tests/tmp/import-command-blocked-target');
const dryRunTargetRoot = path.resolve('tests/tmp/import-command-dry-run-target');
const execFileAsync = promisify(execFile);

async function runCli(args: string[]) {
  return execFileAsync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: path.resolve('.'),
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      HOME: path.join(path.resolve('.'), 'tests', 'tmp', 'isolated-home'),
      OPENCLAW_CONFIG_PATH: path.join(path.resolve('.'), 'tests', 'tmp', '.nonexistent-openclaw.json'),
    },
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
  assert.ok(report.warnings.some((warning: string) => warning.includes('Skill topology is snapshot-only')));
  assert.ok(report.nextSteps.some((step: string) => step.includes('Review the imported identity and memory files')));
  assert.equal(report.writePlan.targetWorkspacePath, blockedTargetRoot);
});

test('import --dry-run defaults to human-readable output and skips writes', async () => {
  await prepareBlockedImportFixture();
  await rm(dryRunTargetRoot, { recursive: true, force: true });

  const { stdout, stderr } = await runCli([
    'import',
    blockedPackageRoot,
    '--target-workspace', dryRunTargetRoot,
    '--agent-id', 'supercoder-dry-run',
    '--dry-run',
  ]);

  assert.equal(stderr, '');
  assert.match(stdout, /^Import dry run/m);
  assert.match(stdout, new RegExp(`- target workspace: ${dryRunTargetRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(stdout, /- target agent id: supercoder-dry-run/);
  assert.match(stdout, /Next steps:/);
  assert.match(stdout, /Review the imported identity and memory files/);
  assert.equal(stdout.includes('{\n  "status": "dry-run"'), false);

  await assert.rejects(access(dryRunTargetRoot));
});

test('import help includes --force safety semantics', async () => {
  const { stdout, stderr } = await runCli(['import', '--help']);

  assert.equal(stderr, '');
  assert.match(stdout, /Overwrite existing workspace files and runtime\s+files in-place/);
  assert.match(stdout, /does not remove unrelated files/);
  assert.match(stdout, /update an existing OpenClaw config entry when\s+--config is provided/);
});

test('import --dry-run with --json prints JSON and skips writes', async () => {
  await prepareBlockedImportFixture();
  await rm(dryRunTargetRoot, { recursive: true, force: true });

  const { stdout, stderr } = await runCli([
    'import',
    blockedPackageRoot,
    '--target-workspace', dryRunTargetRoot,
    '--agent-id', 'supercoder-dry-run',
    '--dry-run',
    '--json',
  ]);

  assert.equal(stderr, '');

  const report = JSON.parse(stdout);
  assert.equal(report.status, 'dry-run');
  assert.equal(report.writePlan.targetWorkspacePath, dryRunTargetRoot);
  assert.equal(report.writePlan.targetAgentId, 'supercoder-dry-run');
  assert.equal(report.writePlan.summary.existingWorkspaceDetected, false);
  assert.ok(report.nextSteps.some((step: string) => step.includes('Review the imported identity and memory files')));

  await assert.rejects(access(dryRunTargetRoot));
});

test('import --help describes --force as overwriting config entries when --config is provided', async () => {
  const { stdout, stderr } = await runCli(['import', '--help']);

  assert.equal(stderr, '');
  assert.match(stdout, /Overwrite existing workspace files and runtime\s+files in-place/);
  assert.match(stdout, /update an existing OpenClaw config entry when\s+--config is provided/);
});
