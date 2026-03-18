import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { validateImportedWorkspace } from '../src/core/validate';
import {
  createTempWorkspace,
  cleanupTempWorkspace,
} from './helpers/workspace-factory';

const tmpBase = path.resolve('tests/tmp/validate-unit');

test('Workspace does not exist - failed contains "Workspace is missing", returns immediately', async () => {
  const nonExistent = path.join(tmpBase, 'nonexistent');
  const report = await validateImportedWorkspace({
    targetWorkspacePath: nonExistent,
  });

  assert.ok(report.failed.some((f) => f.includes('Workspace is missing')));
  assert.equal(report.passed.length, 0);
  assert.ok(!report.warnings.some((w) => w.includes('Skills are manifest-only')));
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
