import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { executeImport } from '../src/core/import-exec';
import { planImport } from '../src/core/import-plan';
import type { ExecutableImportPlan } from '../src/core/types';
import { pathExists } from '../src/utils/fs';
import { buildTestPackage } from './helpers/package-factory';
import { createTempWorkspace } from './helpers/workspace-factory';

const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
const tmpBase = path.resolve('tests/tmp/import-exec');

test('Basic import succeeds - creates workspace files and metadata directory', async () => {
  const pkgRoot = path.join(tmpBase, 'basic', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'basic', 'target');
  await rm(path.join(tmpBase, 'basic'), { recursive: true, force: true }).catch(() => {});

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'test-package',
    agentId: 'test-agent',
  });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'test-agent',
  });

  assert.equal(plan.canProceed, true);
  const execPlan = plan as ExecutableImportPlan;

  const result = await executeImport({ pkg, plan: execPlan });

  assert.equal(result.status, 'ok');
  assert.equal(result.agentId, 'test-agent');
  assert.equal(result.targetWorkspacePath, targetWorkspace);

  const agentDefPath = path.join(targetWorkspace, '.openclaw-agent-package', 'agent-definition.json');
  const agentDef = JSON.parse(await readFile(agentDefPath, 'utf8'));
  assert.equal(agentDef.agentId, 'test-agent');

  const requiredFiles = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md'];
  for (const file of requiredFiles) {
    const content = await readFile(path.join(targetWorkspace, file), 'utf8');
    assert.ok(content.length > 0, `Expected ${file} to exist and have content`);
  }
});

test('import-result.json is created with correct fields', async () => {
  const pkgRoot = path.join(tmpBase, 'import-result', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'import-result', 'target');

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'result-test-pkg',
    agentId: 'result-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'result-agent',
  })) as ExecutableImportPlan;

  const result = await executeImport({ pkg, plan });

  const importResultPath = path.join(
    targetWorkspace,
    '.openclaw-agent-package',
    'import-result.json',
  );
  const stored = JSON.parse(await readFile(importResultPath, 'utf8'));

  assert.equal(stored.status, 'ok');
  assert.deepEqual(stored.importedFiles, result.importedFiles);
  assert.ok(Array.isArray(stored.metadataFiles));
  assert.ok(Array.isArray(stored.warnings));
  assert.ok(Array.isArray(stored.nextSteps));
  assert.equal(typeof stored.expectedChecksums['workspace/AGENTS.md'], 'string');
  assert.equal(stored.targetWorkspacePath, targetWorkspace);
  assert.equal(stored.agentId, 'result-agent');
});

test('agent-definition.json contains correct agentId and importedFromPackage', async () => {
  const pkgRoot = path.join(tmpBase, 'agent-def', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'agent-def', 'target');

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'my-custom-package',
    agentId: 'my-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'my-agent',
  })) as ExecutableImportPlan;

  await executeImport({ pkg, plan });

  const agentDefPath = path.join(targetWorkspace, '.openclaw-agent-package', 'agent-definition.json');
  const agentDef = JSON.parse(await readFile(agentDefPath, 'utf8'));

  assert.equal(agentDef.agentId, 'my-agent');
  assert.equal(agentDef.importedFromPackage, 'my-custom-package');
  assert.ok(agentDef.portableAgentDefinition);
});

test('overwriteExisting: true replaces package files in-place and preserves unrelated files', async () => {
  const pkgRoot = path.join(tmpBase, 'overwrite', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'overwrite', 'target');

  await createTempWorkspace(targetWorkspace, {
    files: { 'AGENTS.md': '# OLD CONTENT - should be replaced\n' },
    extraFiles: { 'old-file-txt': 'this should be preserved' },
  });

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'overwrite-pkg',
    agentId: 'overwrite-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'overwrite-agent',
    force: true,
  })) as ExecutableImportPlan;

  assert.equal(plan.writePlan.overwriteExisting, true);

  await executeImport({ pkg, plan });

  const agentsContent = await readFile(path.join(targetWorkspace, 'AGENTS.md'), 'utf8');
  assert.ok(!agentsContent.includes('OLD CONTENT - should be replaced'));

  const oldFileExists = await pathExists(path.join(targetWorkspace, 'old-file-txt'));
  assert.equal(oldFileExists, true, 'Unrelated files should be preserved with file-level --force');
  const oldFileContent = await readFile(path.join(targetWorkspace, 'old-file-txt'), 'utf8');
  assert.equal(oldFileContent, 'this should be preserved');
});

test('With targetConfigPath - config file is written with agent entry', async () => {
  const pkgRoot = path.join(tmpBase, 'config-write', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'config-write', 'target');
  const configPath = path.join(tmpBase, 'config-write', 'openclaw.json');
  await rm(path.join(tmpBase, 'config-write'), { recursive: true, force: true }).catch(() => {});

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'config-pkg',
    agentId: 'config-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'config-agent',
    targetConfigPath: configPath,
  })) as ExecutableImportPlan;

  await executeImport({ pkg, plan });

  const config = JSON.parse(await readFile(configPath, 'utf8'));
  assert.ok(config.agents?.list);
  const entry = config.agents.list.find((e: { id?: string }) => e.id === 'config-agent');
  assert.ok(entry);
  assert.equal(path.resolve(entry.workspace), path.resolve(targetWorkspace));
});

test('Without targetConfigPath - config is not written, metadataFiles does not contain config path', async () => {
  const pkgRoot = path.join(tmpBase, 'no-config', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'no-config', 'target');

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'no-config-pkg',
    agentId: 'no-config-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'no-config-agent',
  })) as ExecutableImportPlan;

  const result = await executeImport({ pkg, plan });

  assert.equal(
    result.metadataFiles.filter((f) => f.endsWith('openclaw.json') || f.endsWith('openclaw.jsonc'))
      .length,
    0,
  );
  assert.ok(result.metadataFiles.some((f) => f.includes('agent-definition.json')));
  assert.ok(result.metadataFiles.some((f) => f.includes('import-result.json')));
});

test('binding hints metadata is copied into import metadata directory when present', async () => {
  const pkgRoot = path.join(tmpBase, 'binding-hints', 'fixture.ocpkg');
  const targetWorkspace = path.join(tmpBase, 'binding-hints', 'target');

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'binding-hints-pkg',
    agentId: 'binding-hints-agent',
    bindingHints: [
      {
        agentId: 'binding-hints-agent',
        type: 'route',
        match: {
          channel: 'slack',
          accountId: '*',
        },
      },
    ],
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'binding-hints-agent',
  })) as ExecutableImportPlan;

  const result = await executeImport({ pkg, plan });
  const bindingHintsPath = path.join(
    targetWorkspace,
    '.openclaw-agent-package',
    'binding-hints.json',
  );

  const stored = JSON.parse(await readFile(bindingHintsPath, 'utf8'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].agentId, 'binding-hints-agent');
  assert.ok(result.metadataFiles.some((file) => file.endsWith('binding-hints.json')));
});
