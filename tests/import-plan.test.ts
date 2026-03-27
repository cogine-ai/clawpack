import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractAgentDefinition } from '../src/core/agent-extract';
import { planImport } from '../src/core/import-plan';
import { readPackageDirectory } from '../src/core/package-read';
import { writePackageDirectory } from '../src/core/package-write';
import { detectSkills } from '../src/core/skills-detect';
import { scanWorkspace } from '../src/core/workspace-scan';

const fixture = path.resolve('tests/fixtures/source-workspace');
const packageRoot = path.resolve('tests/tmp/planning-fixture.ocpkg');
const targetRoot = path.resolve('tests/tmp/import-plan-target');

async function buildFixturePackage() {
  await rm(packageRoot, { recursive: true, force: true });
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  await writePackageDirectory({
    outputPath: packageRoot,
    packageName: 'planning-fixture',
    scan,
    skills,
    agentDefinition,
  });
  return readPackageDirectory(packageRoot);
}

test('planImport requires target inputs and warns about v1 manual follow-up', async () => {
  const pkg = await buildFixturePackage();
  const plan = await planImport({
    pkg,
    targetWorkspacePath: targetRoot,
  });

  assert.deepEqual(
    plan.requiredInputs.map((item) => item.key),
    ['agentId'],
  );
  assert.equal(plan.canProceed, false);
  assert.ok(plan.warnings.some((warning) => warning.includes('Skills are manifest-only')));
  assert.ok(plan.nextSteps.some((step) => step.includes('Channel bindings')));
});

test('planImport refuses collisions by default and only allows overwrite with --force', async () => {
  const pkg = await buildFixturePackage();
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });
  await writeFile(path.join(targetRoot, 'AGENTS.md'), '# existing\n', 'utf8');

  const blocked = await planImport({
    pkg,
    targetWorkspacePath: targetRoot,
    targetAgentId: 'supercoder-copy',
  });
  assert.equal(blocked.canProceed, false);
  assert.ok(blocked.failed.some((failure) => failure.includes('already exists')));

  const forced = await planImport({
    pkg,
    targetWorkspacePath: targetRoot,
    targetAgentId: 'supercoder-copy',
    force: true,
  });
  assert.equal(forced.canProceed, true);
  assert.deepEqual(forced.requiredInputs, []);
  assert.deepEqual(forced.failed, []);
  assert.equal(forced.writePlan.overwriteExisting, true);
});

test('planImport preflights target config agent-id collisions and reports safer write plan details', async () => {
  const pkg = await buildFixturePackage();
  const configRoot = path.resolve('tests/tmp/import-plan-config-collision');
  const configPath = path.join(configRoot, 'openclaw-config.json');

  await rm(configRoot, { recursive: true, force: true });
  await mkdir(configRoot, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [
            {
              id: 'supercoder-copy',
              name: 'Existing Agent',
              workspace: '/tmp/existing-workspace',
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  const blocked = await planImport({
    pkg,
    targetWorkspacePath: path.join(configRoot, 'workspace-supercoder-copy'),
    targetAgentId: 'supercoder-copy',
    targetConfigPath: configPath,
  });

  assert.equal(blocked.canProceed, false);
  assert.ok(
    blocked.failed.some((failure) => failure.includes('already exists in OpenClaw config')),
  );
  assert.ok(blocked.nextSteps.some((step) => step.includes('Choose a different --agent-id')));
  assert.ok(blocked.writePlan.metadataDirectory.endsWith('.openclaw-agent-package'));
  assert.ok(blocked.writePlan.workspaceFiles.some((file) => file.relativePath === 'AGENTS.md'));
  assert.equal(blocked.writePlan.summary.fileCount, pkg.workspaceFiles.length);
  assert.equal(blocked.writePlan.summary.existingWorkspaceDetected, false);
  assert.equal(blocked.writePlan.summary.targetConfigDetected, true);
  assert.equal(blocked.writePlan.summary.configAgentCollision, true);

  const forced = await planImport({
    pkg,
    targetWorkspacePath: path.join(configRoot, 'workspace-supercoder-copy'),
    targetAgentId: 'supercoder-copy',
    targetConfigPath: configPath,
    force: true,
  });

  assert.equal(forced.canProceed, true);
  assert.deepEqual(forced.requiredInputs, []);
  assert.deepEqual(forced.failed, []);
  assert.ok(forced.warnings.some((warning) => warning.includes('will be overwritten')));
  assert.equal(forced.writePlan.summary.configAgentCollision, true);
});

test('planImport reports both missing targetWorkspacePath and targetAgentId as requiredInputs', async () => {
  const pkg = await buildFixturePackage();
  const plan = await planImport({ pkg });

  assert.equal(plan.canProceed, false);
  const keys = plan.requiredInputs.map((item) => item.key).sort();
  assert.deepEqual(keys, ['agentId', 'targetWorkspacePath']);
});

test('planImport allows fresh workspace + no config collision without force', async () => {
  const pkg = await buildFixturePackage();
  const freshTarget = path.resolve('tests/tmp/import-plan-fresh');
  await rm(freshTarget, { recursive: true, force: true });

  const plan = await planImport({
    pkg,
    targetWorkspacePath: freshTarget,
    targetAgentId: 'fresh-agent',
  });

  assert.equal(plan.canProceed, true);
  assert.deepEqual(plan.requiredInputs, []);
  assert.deepEqual(plan.failed, []);
  assert.equal(plan.writePlan.summary.existingWorkspaceDetected, false);
});

test('planImport blocks on config collision alone when workspace does not exist', async () => {
  const pkg = await buildFixturePackage();
  const configRoot = path.resolve('tests/tmp/import-plan-config-only-collision');
  const configPath = path.join(configRoot, 'openclaw-config.json');
  const freshTarget = path.join(configRoot, 'workspace-new');

  await rm(configRoot, { recursive: true, force: true });
  await mkdir(configRoot, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      agents: { list: [{ id: 'blocker', name: 'Blocker', workspace: '/elsewhere' }] },
    }),
  );

  const plan = await planImport({
    pkg,
    targetWorkspacePath: freshTarget,
    targetAgentId: 'blocker',
    targetConfigPath: configPath,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((f) => f.includes('already exists in OpenClaw config')));
  assert.equal(plan.writePlan.summary.existingWorkspaceDetected, false);
  assert.equal(plan.writePlan.summary.configAgentCollision, true);
});

test('planImport force overrides both workspace and config collision simultaneously', async () => {
  const pkg = await buildFixturePackage();
  const configRoot = path.resolve('tests/tmp/import-plan-double-collision');
  const configPath = path.join(configRoot, 'openclaw-config.json');
  const existingTarget = path.join(configRoot, 'workspace-existing');

  await rm(configRoot, { recursive: true, force: true });
  await mkdir(existingTarget, { recursive: true });
  await writeFile(path.join(existingTarget, 'AGENTS.md'), '# old\n');
  await writeFile(
    configPath,
    JSON.stringify({
      agents: { list: [{ id: 'dual', name: 'Dual', workspace: '/old' }] },
    }),
  );

  const plan = await planImport({
    pkg,
    targetWorkspacePath: existingTarget,
    targetAgentId: 'dual',
    targetConfigPath: configPath,
    force: true,
  });

  assert.equal(plan.canProceed, true);
  assert.deepEqual(plan.failed, []);
  assert.equal(plan.writePlan.overwriteExisting, true);
  assert.equal(plan.writePlan.summary.existingWorkspaceDetected, true);
  assert.equal(plan.writePlan.summary.configAgentCollision, true);
  assert.ok(plan.warnings.some((w) => w.includes('overwritten') && w.includes('--force')));
  assert.ok(plan.warnings.some((w) => w.includes('overwritten') && w.includes('config')));
});

test('planImport blocks when target workspace path exists as a file', async () => {
  const pkg = await buildFixturePackage();
  const conflictRoot = path.resolve('tests/tmp/import-plan-file-conflict');
  const fileTarget = path.join(conflictRoot, 'workspace-file');

  await rm(conflictRoot, { recursive: true, force: true });
  await mkdir(conflictRoot, { recursive: true });
  await writeFile(fileTarget, 'not-a-directory\n', 'utf8');

  const plan = await planImport({
    pkg,
    targetWorkspacePath: fileTarget,
    targetAgentId: 'file-conflict-agent',
    force: true,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((failure) => failure.includes('is an existing file')));
});

test('planImport blocks when parent path prevents target workspace directory creation', async () => {
  const pkg = await buildFixturePackage();
  const blockedRoot = path.join(tmpdir(), 'clawpack-import-plan-parent-blocked');
  const parentFile = path.join(blockedRoot, 'file-parent');
  const blockedTarget = path.join(parentFile, 'workspace-child');

  await rm(blockedRoot, { recursive: true, force: true });
  await mkdir(blockedRoot, { recursive: true });
  await writeFile(parentFile, 'file-parent\n', 'utf8');

  const plan = await planImport({
    pkg,
    targetWorkspacePath: blockedTarget,
    targetAgentId: 'parent-conflict-agent',
    force: true,
  });

  assert.equal(plan.canProceed, false);
  assert.ok(plan.failed.some((failure) => failure.includes('cannot be created because parent path is a file')));
});
