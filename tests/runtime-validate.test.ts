import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { executeImport } from '../src/core/import-exec';
import { planImport } from '../src/core/import-plan';
import { validateImportedWorkspace } from '../src/core/validate';
import type { ExecutableImportPlan } from '../src/core/types';
import { pathExists } from '../src/utils/fs';
import { buildRuntimeTestPackage } from './helpers/runtime-package-factory';

const tmpBase = path.resolve('tests/tmp/runtime-validate');

async function cleanup(subdir: string) {
  await rm(path.join(tmpBase, subdir), { recursive: true, force: true });
}

async function importWithRuntime(subdir: string, options?: {
  runtimeFiles?: Record<string, string>;
  configPath?: string;
}) {
  const pkgRoot = path.join(tmpBase, subdir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, subdir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, subdir, 'target-agent');
  const configPath = options?.configPath ?? path.join(tmpBase, subdir, 'openclaw.json');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: options?.runtimeFiles ?? {
      'settings.json': '{}',
      'AGENTS.md': '# A\n',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-val',
    targetAgentDir,
    targetConfigPath: configPath,
  })) as ExecutableImportPlan;

  await executeImport({ pkg, plan });
  return { targetWorkspace, targetAgentDir, configPath };
}

test('Validate passes for correctly imported runtime layer', async () => {
  const dir = 'valid';
  await cleanup(dir);
  const { targetWorkspace, targetAgentDir, configPath } = await importWithRuntime(dir);

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.equal(report.failed.length, 0, `Unexpected failures: ${report.failed.join(', ')}`);
  assert.ok(report.passed.some((p) => p.includes('Runtime agentDir exists')));
  assert.ok(report.passed.some((p) => p.includes('agentDir matches')));
  assert.ok(report.passed.some((p) => p.includes('Runtime file present: settings.json')));
  assert.ok(report.passed.some((p) => p.includes('Runtime file present: AGENTS.md')));
  assert.ok(report.passed.some((p) => p.includes('Excluded auth file correctly absent: auth.json')));
  assert.ok(report.passed.some((p) => p.includes('Excluded auth file correctly absent: auth-profiles.json')));
});

test('Validate detects missing runtime files', async () => {
  const dir = 'missing-file';
  await cleanup(dir);
  const { targetWorkspace, targetAgentDir, configPath } = await importWithRuntime(dir);

  await rm(path.join(targetAgentDir, 'settings.json'), { force: true });

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.ok(report.failed.some((f) => f.includes('Missing expected runtime file: settings.json')));
});

test('Validate detects agentDir mismatch in config', async () => {
  const dir = 'dir-mismatch';
  await cleanup(dir);
  const { targetWorkspace, configPath } = await importWithRuntime(dir);

  const wrongDir = path.join(tmpBase, dir, 'wrong-agent-dir');

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir: wrongDir,
    targetConfigPath: configPath,
  });

  assert.ok(report.failed.some((f) => f.includes('agentDir') && f.includes('missing')));
});

test('Validate warns about auth files if they exist', async () => {
  const dir = 'auth-warning';
  await cleanup(dir);
  const { targetWorkspace, targetAgentDir, configPath } = await importWithRuntime(dir);

  await writeFile(path.join(targetAgentDir, 'auth.json'), '{}', 'utf8');

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.ok(report.warnings.some((w) => w.includes('auth.json') && w.includes('should not have been imported')));
});

test('Validate confirms settings.json is valid JSON', async () => {
  const dir = 'valid-settings';
  await cleanup(dir);
  const { targetWorkspace, targetAgentDir, configPath } = await importWithRuntime(dir);

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.ok(report.passed.some((p) => p.includes('settings.json is valid JSON')));
});

test('Validate without --target-agent-dir skips runtime checks', async () => {
  const dir = 'no-rt-flag';
  await cleanup(dir);
  const { targetWorkspace, configPath } = await importWithRuntime(dir);

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetConfigPath: configPath,
  });

  const hasRuntimeChecks = report.passed.some((p) => p.includes('Runtime'));
  assert.equal(hasRuntimeChecks, false);
});

test('Validate detects missing agentDir directory', async () => {
  const dir = 'missing-dir';
  await cleanup(dir);
  const { targetWorkspace, configPath } = await importWithRuntime(dir);

  const nonexistentDir = path.join(tmpBase, dir, 'does-not-exist');

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'rt-val',
    targetAgentDir: nonexistentDir,
    targetConfigPath: configPath,
  });

  assert.ok(report.failed.some((f) => f.includes('agentDir is missing')));
});
