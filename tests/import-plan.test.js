const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { rm, mkdir, writeFile } = require('node:fs/promises');
const { scanWorkspace } = require('../dist/core/workspace-scan.js');
const { detectSkills } = require('../dist/core/skills-detect.js');
const { extractAgentDefinition } = require('../dist/core/agent-extract.js');
const { writePackageDirectory } = require('../dist/core/package-write.js');
const { readPackageDirectory } = require('../dist/core/package-read.js');
const { planImport } = require('../dist/core/import-plan.js');

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

  assert.deepEqual(plan.requiredInputs.map((item) => item.key), ['agentId']);
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
  assert.equal(forced.writePlan.overwriteExisting, true);
});

test('planImport preflights target config agent-id collisions and reports safer write plan details', async () => {
  const pkg = await buildFixturePackage();
  const configRoot = path.resolve('tests/tmp/import-plan-config-collision');
  const configPath = path.join(configRoot, 'openclaw-config.json');

  await rm(configRoot, { recursive: true, force: true });
  await mkdir(configRoot, { recursive: true });
  await writeFile(configPath, JSON.stringify({
    agents: {
      'supercoder-copy': {
        id: 'supercoder-copy',
        name: 'Existing Agent',
        workspace: '/tmp/existing-workspace'
      }
    }
  }, null, 2));

  const blocked = await planImport({
    pkg,
    targetWorkspacePath: path.join(configRoot, 'workspace-supercoder-copy'),
    targetAgentId: 'supercoder-copy',
    targetConfigPath: configPath,
  });

  assert.equal(blocked.canProceed, false);
  assert.ok(blocked.failed.some((failure) => failure.includes('already exists in OpenClaw config')));
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
  assert.ok(forced.warnings.some((warning) => warning.includes('will be overwritten')));
  assert.equal(forced.writePlan.summary.configAgentCollision, true);
});
