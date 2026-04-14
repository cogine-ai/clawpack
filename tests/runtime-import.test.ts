import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { executeImport } from '../src/core/import-exec';
import { planImport } from '../src/core/import-plan';
import type { ExecutableImportPlan, ReadPackageResult } from '../src/core/types';
import { pathExists } from '../src/utils/fs';
import { buildRuntimeTestPackage } from './helpers/runtime-package-factory';

const tmpBase = path.resolve('tests/tmp/runtime-import');

async function cleanup(subdir: string) {
  await rm(path.join(tmpBase, subdir), { recursive: true, force: true });
}

test('Runtime import writes files under target agentDir', async () => {
  const dir = 'basic';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'AGENTS.md': '# Runtime AGENTS\n',
      'settings.json': JSON.stringify({ theme: 'dark' }, null, 2),
      'prompts/default.md': '# Default prompt\n',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-agent',
    targetAgentDir,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  assert.ok(execPlan.writePlan.runtimePlan);
  assert.equal(execPlan.writePlan.runtimePlan.targetAgentDir, targetAgentDir);

  const result = await executeImport({ pkg, plan: execPlan });

  assert.equal(result.status, 'ok');
  assert.ok(result.importedRuntimeFiles.length > 0);
  assert.equal(result.targetAgentDir, targetAgentDir);

  assert.ok(await pathExists(path.join(targetAgentDir, 'AGENTS.md')));
  assert.ok(await pathExists(path.join(targetAgentDir, 'settings.json')));
  assert.ok(await pathExists(path.join(targetAgentDir, 'prompts/default.md')));
});

test('Runtime import blocks on existing files without --force', async () => {
  const dir = 'collision-block';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  await mkdir(targetAgentDir, { recursive: true });
  await writeFile(path.join(targetAgentDir, 'settings.json'), '{}', 'utf8');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': JSON.stringify({ theme: 'dark' }),
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-blocked',
    targetAgentDir,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((f) => f.includes('runtime file(s) already exist')));
});

test('Runtime import overwrites existing files with --force', async () => {
  const dir = 'collision-force';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  await mkdir(targetAgentDir, { recursive: true });
  await writeFile(path.join(targetAgentDir, 'settings.json'), '{"old": true}', 'utf8');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': JSON.stringify({ theme: 'dark' }),
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-forced',
    targetAgentDir,
    force: true,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  const result = await executeImport({ pkg, plan: execPlan });

  assert.equal(result.status, 'ok');
  const settings = JSON.parse(await readFile(path.join(targetAgentDir, 'settings.json'), 'utf8'));
  assert.equal(settings.theme, 'dark');
});

test('Runtime import never writes auth files', async () => {
  const dir = 'auth-safety';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'AGENTS.md': '# Runtime\n',
      'settings.json': '{}',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-safe',
    targetAgentDir,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  await executeImport({ pkg, plan: execPlan });

  assert.equal(await pathExists(path.join(targetAgentDir, 'auth.json')), false);
  assert.equal(await pathExists(path.join(targetAgentDir, 'auth-profiles.json')), false);
});

test('Runtime import rewrites workspace/agentDir paths in settings.json', async () => {
  const dir = 'path-rewrite';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const srcWs = '/home/alice/workspace-mybot';
  const srcAd = '/home/alice/.openclaw/agents/mybot';

  const settingsContent = {
    workspaceRoot: srcWs,
    agentConfig: `${srcAd}/config`,
    logDir: `${srcWs}/logs`,
    relative: './data',
    external: '/usr/local/bin/tool',
  };

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': JSON.stringify(settingsContent, null, 2),
    },
    sourceAgentDir: srcAd,
    sourceWorkspacePath: srcWs,
    settingsAnalysis: {
      pathRefs: [
        { key: 'workspaceRoot', value: srcWs, classification: 'package-internal-workspace' },
        { key: 'agentConfig', value: `${srcAd}/config`, classification: 'package-internal-agentDir' },
        { key: 'logDir', value: `${srcWs}/logs`, classification: 'package-internal-workspace' },
        { key: 'relative', value: './data', classification: 'relative' },
        { key: 'external', value: '/usr/local/bin/tool', classification: 'external-absolute' },
      ],
      summary: {
        total: 5,
        packageInternalWorkspace: 2,
        packageInternalAgentDir: 1,
        relative: 1,
        externalAbsolute: 1,
        hostBound: 0,
      },
    },
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-rewrite',
    targetAgentDir,
    force: true,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  await executeImport({ pkg, plan: execPlan });

  const result = JSON.parse(await readFile(path.join(targetAgentDir, 'settings.json'), 'utf8'));
  assert.equal(result.workspaceRoot, targetWorkspace);
  assert.equal(result.agentConfig, `${targetAgentDir}/config`);
  assert.equal(result.logDir, `${targetWorkspace}/logs`);
  assert.equal(result.relative, './data');
  assert.equal(result.external, '/usr/local/bin/tool');
});

test('Runtime import upserts agentDir into config', async () => {
  const dir = 'config-upsert';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');
  const configPath = path.join(tmpBase, dir, 'openclaw.json');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': '{}',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-config',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  await executeImport({ pkg, plan: execPlan });

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const entry = config.agents?.list?.find((e: { id?: string }) => e.id === 'rt-config');
  assert.ok(entry);
  assert.equal(entry.agentDir, targetAgentDir);
  assert.equal(path.resolve(entry.workspace), path.resolve(targetWorkspace));
});

test('Runtime import resolves target agentDir from current agents.defaults semantics', async () => {
  const dir = 'config-derived-agentdir';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const configPath = path.join(tmpBase, dir, 'openclaw.json');
  const expectedAgentDir = path.join(tmpBase, dir, 'agent-root', 'rt-derived', 'agent');

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          defaults: {
            workspace: path.join(tmpBase, dir, 'workspace-root'),
            agentDir: path.join(tmpBase, dir, 'agent-root'),
          },
          list: [{ id: 'main', default: true }, { id: 'rt-derived' }],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': '{}',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-derived',
    targetConfigPath: configPath,
    force: true,
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;
  assert.equal(execPlan.writePlan.runtimePlan?.targetAgentDir, expectedAgentDir);
});

test('Runtime import plan fails when no agentDir can be resolved', async () => {
  const dir = 'no-agentdir';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: { 'settings.json': '{}' },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-noad',
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((f) => f.includes('target agentDir')));
});

test('Runtime import blocks when agentDir is claimed by another agent', async () => {
  const dir = 'dir-claimed';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'shared-agent-dir');
  const configPath = path.join(tmpBase, dir, 'openclaw.json');

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({
    agents: {
      list: [{
        id: 'other-agent',
        name: 'Other',
        workspace: '/somewhere/else',
        agentDir: targetAgentDir,
      }],
    },
  }, null, 2), 'utf8');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: { 'settings.json': '{}' },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-claimed',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((f) => f.includes('claimed by another agent')));
});

test('Runtime import also treats legacy top-level agentDir as occupied', async () => {
  const dir = 'legacy-dir-claimed';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'shared-agent-dir');
  const configPath = path.join(tmpBase, dir, 'openclaw.json');

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agent: {
          id: 'legacy-agent',
          name: 'Legacy',
          workspace: '/legacy/workspace',
          agentDir: targetAgentDir,
        },
        agents: {
          list: [{ id: 'main', default: true, workspace: '/current/workspace' }],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': '{}',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'imported-agent',
    targetAgentDir,
    targetConfigPath: configPath,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((f) => f.includes('claimed by another agent')));
});

test('Package with runtime=none does not trigger runtime import', async () => {
  const dir = 'no-runtime';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {},
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
    runtimeMode: 'none',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-none',
    targetAgentDir,
  });

  assert.equal(plan.canProceed, true);
  assert.equal(plan.writePlan.runtimePlan, undefined);
  assert.equal(plan.writePlan.summary.runtimeFileCount, 0);
});

test('Dry-run prints runtime plan info (text + JSON)', async () => {
  const dir = 'dryrun';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': '{}',
      'AGENTS.md': '# A\n',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-dry',
    targetAgentDir,
  });

  assert.equal(plan.canProceed, true);
  assert.ok(plan.writePlan.runtimePlan);
  assert.equal(plan.writePlan.summary.runtimeFileCount, 2);
  assert.equal(plan.writePlan.runtimePlan.targetAgentDir, targetAgentDir);
});

test('Import result includes importedRuntimeFiles field', async () => {
  const dir = 'result-field';
  await cleanup(dir);
  const pkgRoot = path.join(tmpBase, dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, dir, 'target-ws');
  const targetAgentDir = path.join(tmpBase, dir, 'target-agent');

  const pkg = await buildRuntimeTestPackage(pkgRoot, {
    runtimeFiles: {
      'settings.json': '{}',
      'themes/dark.json': '{"bg":"#000"}',
    },
    sourceAgentDir: '/source/agent-dir',
    sourceWorkspacePath: '/source/workspace',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'rt-result',
    targetAgentDir,
  })) as ExecutableImportPlan;

  const result = await executeImport({ pkg, plan });

  assert.ok(Array.isArray(result.importedRuntimeFiles));
  assert.ok(result.importedRuntimeFiles.includes('settings.json'));
  assert.ok(result.importedRuntimeFiles.includes('themes/dark.json'));

  const importResultPath = path.join(targetWorkspace, '.openclaw-agent-package', 'import-result.json');
  const stored = JSON.parse(await readFile(importResultPath, 'utf8'));
  assert.deepEqual(stored.importedRuntimeFiles, result.importedRuntimeFiles);
  assert.equal(stored.targetAgentDir, targetAgentDir);
});
