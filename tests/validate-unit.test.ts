import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { executeImport } from '../src/core/import-exec';
import { planImport } from '../src/core/import-plan';
import { validateImportedWorkspace } from '../src/core/validate';
import type { ExecutableImportPlan } from '../src/core/types';
import {
  createTempWorkspace,
  cleanupTempWorkspace,
} from './helpers/workspace-factory';
import { buildTestPackage } from './helpers/package-factory';

const tmpBase = path.resolve('tests/tmp/validate-unit');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');

test('Workspace does not exist - failed contains "Workspace is missing", returns immediately', async () => {
  const nonExistent = path.join(tmpBase, 'nonexistent');
  const report = await validateImportedWorkspace({
    targetWorkspacePath: nonExistent,
  });

  assert.ok(report.failed.some((f) => f.includes('Workspace is missing')));
  assert.equal(report.passed.length, 0);
  assert.ok(!report.warnings.some((w) => w.includes('Skill topology is snapshot-only')));
});

test('Workspace exists with all required files + agent-definition.json - all passed', async () => {
  const workspace = path.join(tmpBase, 'complete');
  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
    },
  });

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(report.failed.length === 0);
    assert.ok(report.passed.some((p) => p.includes('Workspace exists')));
    assert.ok(
      report.passed.some((p) => p.includes('Portable agent definition record present')),
    );
    assert.ok(
      report.passed.some((p) => p.includes('Workspace file present: AGENTS.md')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('Workspace missing AGENTS.md - failed contains "Missing required workspace file: AGENTS.md"', async () => {
  const workspace = path.join(tmpBase, 'missing-agents');
  await createTempWorkspace(workspace, {
    skipRequired: ['AGENTS.md'],
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
    },
  });

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(
      report.failed.some((f) => f.includes('Missing required workspace file: AGENTS.md')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('Workspace complete but missing .openclaw-agent-package/agent-definition.json - failed contains "Missing imported agent definition record"', async () => {
  const workspace = path.join(tmpBase, 'no-agent-def');
  await createTempWorkspace(workspace);

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(
      report.failed.some((f) => f.includes('Missing imported agent definition record')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('Workspace missing optional OpenClaw files does not fail workspace contract validation', async () => {
  const workspace = path.join(tmpBase, 'missing-optional-openclaw-files');
  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
      'BOOT.md': '# BOOT\n',
    },
  });

  try {
    await rm(path.join(workspace, 'MEMORY.md'), { force: true });
    await rm(path.join(workspace, 'MEMORY.MD'), { force: true });

    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(
      !report.failed.some((f) => f.includes('Missing required workspace file: MEMORY.md')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('Workspace with lowercase memory.md fallback is treated as valid', async () => {
  const workspace = path.join(tmpBase, 'lowercase-memory-fallback');
  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
      'memory.md': '# memory fallback\n',
    },
  });

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(report.passed.some((p) => p.includes('Optional workspace file present: memory.md')));
    assert.ok(
      !report.failed.some((f) => f.includes('Missing required workspace file: memory.md')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('agent-definition.json has mismatched agentId - failed contains "mismatch"', async () => {
  const workspace = path.join(tmpBase, 'mismatch-agent-id');
  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'other-agent',
      }),
    },
  });

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
    });

    assert.ok(report.failed.some((f) => f.includes('mismatch')));
    assert.ok(
      report.failed.some((f) =>
        f.includes('expected test-agent') && f.includes('other-agent'),
      ),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
  }
});

test('Config path provided but no agentId - warnings contains "consistency check skipped"', async () => {
  const workspace = path.join(tmpBase, 'config-no-agent-id');
  const configDir = path.join(tmpBase, 'config-no-agent-id-config');
  const configPath = path.join(configDir, 'openclaw.json');

  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
    },
  });
  await mkdir(configDir, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [{ id: 'test-agent', workspace }],
        },
      },
      null,
      2,
    ),
  );

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      targetConfigPath: configPath,
    });

    assert.ok(
      report.warnings.some((w) => w.includes('consistency check skipped')),
    );
    assert.ok(
      report.warnings.some((w) => w.includes('--agent-id was not provided')),
    );
  } finally {
    await cleanupTempWorkspace(workspace);
    await cleanupTempWorkspace(configDir);
  }
});

test('Config has workspace path mismatch - failed contains "workspace mismatch"', async () => {
  const workspace = path.join(tmpBase, 'config-mismatch');
  const configDir = path.join(tmpBase, 'config-mismatch-config');
  const configPath = path.join(configDir, 'openclaw.json');

  await createTempWorkspace(workspace, {
    extraFiles: {
      '.openclaw-agent-package/agent-definition.json': JSON.stringify({
        agentId: 'test-agent',
      }),
    },
  });
  await mkdir(configDir, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [{ id: 'test-agent', workspace: '/tmp/wrong-workspace' }],
        },
      },
      null,
      2,
    ),
  );

  try {
    const report = await validateImportedWorkspace({
      targetWorkspacePath: workspace,
      agentId: 'test-agent',
      targetConfigPath: configPath,
    });

    assert.ok(report.failed.some((f) => f.includes('workspace mismatch')));
  } finally {
    await cleanupTempWorkspace(workspace);
    await cleanupTempWorkspace(configDir);
  }
});

test('Validate reports workspace checksum mismatch when imported file content changes', async () => {
  const dir = path.join(tmpBase, 'workspace-checksum-mismatch');
  const pkgRoot = path.join(dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(dir, 'target');

  await rm(dir, { recursive: true, force: true });

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'checksum-test-pkg',
    agentId: 'checksum-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'checksum-agent',
  })) as ExecutableImportPlan;

  await executeImport({ pkg, plan });
  const original = await readFile(path.join(targetWorkspace, 'AGENTS.md'), 'utf8');
  await writeFile(path.join(targetWorkspace, 'AGENTS.md'), `${original}\nmodified\n`, 'utf8');

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'checksum-agent',
  });

  assert.ok(
    report.failed.some((f) => f.includes('Checksum mismatch') && f.includes('workspace/AGENTS.md')),
  );
});

test('Validate reports missing imported workspace files as failures', async () => {
  const dir = path.join(tmpBase, 'workspace-missing-imported-file');
  const pkgRoot = path.join(dir, 'fixture.ocpkg');
  const targetWorkspace = path.join(dir, 'target');

  await rm(dir, { recursive: true, force: true });

  const pkg = await buildTestPackage(fixtureWorkspace, pkgRoot, {
    packageName: 'missing-file-test-pkg',
    agentId: 'missing-file-agent',
  });

  const plan = (await planImport({
    pkg,
    targetWorkspacePath: targetWorkspace,
    targetAgentId: 'missing-file-agent',
  })) as ExecutableImportPlan;

  await executeImport({ pkg, plan });
  await rm(path.join(targetWorkspace, 'notes.txt'), { force: true });

  const report = await validateImportedWorkspace({
    targetWorkspacePath: targetWorkspace,
    agentId: 'missing-file-agent',
  });

  assert.ok(
    report.failed.some((f) => f.includes('workspace/notes.txt')),
    `Expected missing imported file failure, got: ${report.failed.join(', ')}`,
  );
});
