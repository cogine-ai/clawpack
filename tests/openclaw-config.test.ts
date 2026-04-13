import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  discoverOpenClawConfig,
  extractPortableAgentDefinition,
  hasAgentInConfig,
  loadOpenClawConfig,
  resolveAgentDir,
  resolveAgentFromConfig,
  upsertPortableAgentDefinition,
} from '../src/core/openclaw-config';
import type { MinimalOpenClawConfig } from '../src/core/openclaw-config';
import { runCli } from './helpers/run-cli';

const fixtureConfig = path.resolve('tests/fixtures/openclaw-config/source-config.jsonc');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
const includeFixtureConfig = path.resolve('tests/fixtures/openclaw-config/includes/root.json');
const inspectTarget = path.resolve('tests/tmp/inspect-output.json');
const importTargetRoot = path.resolve('tests/tmp/config-import-target');
const importWorkspace = path.join(importTargetRoot, 'workspace-supercoder-imported');
const importConfig = path.join(importTargetRoot, 'openclaw-config.json');
const exportOut = path.resolve('tests/tmp/config-backed-export.ocpkg');
const parserFixtureRoot = path.resolve('tests/tmp/openclaw-config-parser');

async function writeJsoncFixture(filename: string, contents: string) {
  await mkdir(parserFixtureRoot, { recursive: true });
  const configPath = path.join(parserFixtureRoot, filename);
  await writeFile(configPath, contents, 'utf8');
  return configPath;
}

// --- discovery ---

test('discoverOpenClawConfig resolves explicit configPath', async () => {
  const discovered = await discoverOpenClawConfig({ configPath: fixtureConfig });
  assert.equal(discovered.configPath, fixtureConfig);
});

test('discoverOpenClawConfig respects OPENCLAW_CONFIG_PATH env var', async () => {
  const configPath = await writeJsoncFixture('env-var-config.json', '{}');
  const original = process.env.OPENCLAW_CONFIG_PATH;
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  try {
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    process.env.OPENCLAW_STATE_DIR = path.join(parserFixtureRoot, 'ignored-state-dir');
    const discovered = await discoverOpenClawConfig();
    assert.equal(discovered.configPath, configPath);
  } finally {
    if (original === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = original;
    }

    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }
  }
});

test('discoverOpenClawConfig throws when no config found', async () => {
  const missingRoot = path.join(parserFixtureRoot, 'missing-instance');
  await rm(missingRoot, { recursive: true, force: true });
  await mkdir(missingRoot, { recursive: true });

  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const originalHome = process.env.HOME;
  try {
    delete process.env.OPENCLAW_CONFIG_PATH;
    process.env.HOME = missingRoot;
    await assert.rejects(
      discoverOpenClawConfig({ cwd: missingRoot }),
      /OpenClaw config not found/,
    );
  } finally {
    if (originalConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

test('discoverOpenClawConfig resolves config from OPENCLAW_STATE_DIR and falls back to legacy filename', async () => {
  const stateDir = path.join(parserFixtureRoot, 'state-dir-override');
  const legacyConfigPath = path.join(stateDir, 'clawdbot.json');

  await rm(stateDir, { recursive: true, force: true });
  await mkdir(stateDir, { recursive: true });
  await writeFile(legacyConfigPath, '{}', 'utf8');

  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  try {
    delete process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const discovered = await discoverOpenClawConfig();
    assert.equal(discovered.configPath, legacyConfigPath);
  } finally {
    if (originalConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    }

    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }
  }
});

test('discoverOpenClawConfig falls back to the legacy state dir when canonical state dir is absent', async () => {
  const fakeHome = path.join(parserFixtureRoot, 'legacy-home');
  const legacyDir = path.join(fakeHome, '.clawdbot');
  const legacyConfigPath = path.join(legacyDir, 'clawdbot.json');

  await rm(fakeHome, { recursive: true, force: true });
  await mkdir(legacyDir, { recursive: true });
  await writeFile(legacyConfigPath, '{}', 'utf8');

  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;
  const originalHome = process.env.HOME;
  try {
    delete process.env.OPENCLAW_CONFIG_PATH;
    delete process.env.OPENCLAW_STATE_DIR;
    process.env.HOME = fakeHome;

    const discovered = await discoverOpenClawConfig();
    assert.equal(discovered.configPath, legacyConfigPath);
  } finally {
    if (originalConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    }

    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }

    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

// --- loading agents.list format ---

test('loadOpenClawConfig parses agents.list fixture and resolves agent by id', async () => {
  const loaded = await loadOpenClawConfig({ configPath: fixtureConfig });
  assert.ok(loaded.config.agents?.list, 'agents.list should exist');
  const supercoder = loaded.config.agents.list.find((a) => a.id === 'supercoder');
  assert.ok(supercoder, 'supercoder agent should exist in list');
  assert.equal(supercoder.name, 'Supercoder');
});

// --- loading single-agent format ---

test('loadOpenClawConfig parses single-agent format', async () => {
  const configPath = await writeJsoncFixture(
    'single-agent.json',
    JSON.stringify({
      agent: {
        id: 'solo',
        name: 'Solo Agent',
        workspace: '~/.openclaw/workspace',
        model: { default: 'gpt-5' },
      },
    }),
  );

  const loaded = await loadOpenClawConfig({ configPath });
  assert.ok(loaded.config.agent, 'agent field should exist');
  assert.equal(loaded.config.agent.name, 'Solo Agent');
});

test('loadOpenClawConfig parses JSON5 and resolves nested includes relative to each included file', async () => {
  const loaded = await loadOpenClawConfig({ configPath: includeFixtureConfig });
  const agent = loaded.config.agents?.list?.find((entry) => entry.id === 'supercoder');

  assert.equal(loaded.config.openclawVersion, '2026.4.9');
  assert.equal(loaded.config.runtime?.transport, 'stdio');
  assert.deepEqual(loaded.config.tags, ['base', 'root']);
  assert.equal(agent?.name, 'Supercoder');
  assert.equal(agent?.identity?.name, 'Nested Identity');
  assert.equal(agent?.tools?.profile, 'strict');
  assert.equal(agent?.workspace, './workspaces/source-workspace');
  assert.equal(agent?.model?.default, 'openai-codex/gpt-5.4');
});

// --- resolveAgentFromConfig ---

test('resolveAgentFromConfig finds agent in single-agent config', () => {
  const config: MinimalOpenClawConfig = {
    agent: { id: 'solo', name: 'Solo', workspace: '/w' },
  };

  const result = resolveAgentFromConfig(config, 'solo');
  assert.ok(result);
  assert.equal(result.resolvedId, 'solo');
  assert.equal(result.agent.name, 'Solo');
});

test('resolveAgentFromConfig returns single agent when no agentId specified', () => {
  const config: MinimalOpenClawConfig = {
    agent: { name: 'Solo', workspace: '/w' },
  };

  const result = resolveAgentFromConfig(config);
  assert.ok(result);
  assert.equal(result.resolvedId, 'default');
});

test('resolveAgentFromConfig finds agent in agents.list by id', () => {
  const config: MinimalOpenClawConfig = {
    agents: {
      list: [
        { id: 'alpha', name: 'Alpha' },
        { id: 'beta', name: 'Beta' },
      ],
    },
  };

  assert.equal(resolveAgentFromConfig(config, 'beta')?.agent.name, 'Beta');
  assert.equal(resolveAgentFromConfig(config, 'missing'), undefined);
});

test('resolveAgentFromConfig prefers default agent in list when no agentId', () => {
  const config: MinimalOpenClawConfig = {
    agents: {
      list: [
        { id: 'first', name: 'First' },
        { id: 'main', name: 'Main', default: true },
      ],
    },
  };

  const result = resolveAgentFromConfig(config);
  assert.ok(result);
  assert.equal(result.resolvedId, 'main');
});

test('resolveAgentFromConfig falls back to first list entry when no default', () => {
  const config: MinimalOpenClawConfig = {
    agents: { list: [{ id: 'only', name: 'Only' }] },
  };

  const result = resolveAgentFromConfig(config);
  assert.ok(result);
  assert.equal(result.resolvedId, 'only');
});

test('resolveAgentDir matches the workspace agent when agentId is omitted', async () => {
  const configPath = await writeJsoncFixture(
    'resolve-agent-dir-by-workspace.json',
    JSON.stringify({
      agents: {
        list: [
          {
            id: 'default-agent',
            default: true,
            workspace: '/tmp/another-workspace',
            agentDir: 'agents/default-agent',
          },
          {
            id: 'workspace-agent',
            workspace: fixtureWorkspace,
            agentDir: 'agents/workspace-agent',
          },
        ],
      },
    }),
  );

  const resolved = await resolveAgentDir({
    configPath,
    workspacePath: fixtureWorkspace,
  });

  assert.equal(
    resolved,
    path.resolve(path.dirname(configPath), 'agents/workspace-agent'),
  );
});

test('resolveAgentDir prefers exact workspace path over basename-only match', async () => {
  const configPath = await writeJsoncFixture(
    'resolve-agent-dir-prefers-exact-workspace.json',
    JSON.stringify({
      agents: {
        list: [
          {
            id: 'wrong-agent',
            workspace: '/tmp/elsewhere/workspace-shared',
            agentDir: 'agents/wrong-agent',
          },
          {
            id: 'right-agent',
            workspace: fixtureWorkspace,
            agentDir: 'agents/right-agent',
          },
        ],
      },
    }),
  );

  const targetWorkspace = path.join('/tmp', 'another-parent', path.basename(fixtureWorkspace));
  const exactConfigPath = await writeJsoncFixture(
    'resolve-agent-dir-exact-workspace.json',
    JSON.stringify({
      agents: {
        list: [
          {
            id: 'wrong-agent',
            workspace: fixtureWorkspace,
            agentDir: 'agents/wrong-agent',
          },
          {
            id: 'right-agent',
            workspace: targetWorkspace,
            agentDir: 'agents/right-agent',
          },
        ],
      },
    }),
  );

  const resolved = await resolveAgentDir({
    configPath: exactConfigPath,
    workspacePath: targetWorkspace,
  });

  assert.equal(
    resolved,
    path.resolve(path.dirname(exactConfigPath), 'agents/right-agent'),
  );
});

// --- hasAgentInConfig ---

test('hasAgentInConfig checks both single and list formats', () => {
  const singleConfig: MinimalOpenClawConfig = { agent: { id: 'solo' } };
  assert.equal(hasAgentInConfig(singleConfig, 'solo'), true);
  assert.equal(hasAgentInConfig(singleConfig, 'other'), false);

  const listConfig: MinimalOpenClawConfig = {
    agents: { list: [{ id: 'alpha' }, { id: 'beta' }] },
  };
  assert.equal(hasAgentInConfig(listConfig, 'alpha'), true);
  assert.equal(hasAgentInConfig(listConfig, 'gamma'), false);
});

// --- extractPortableAgentDefinition ---

test('extractPortableAgentDefinition extracts from agents.list fixture', async () => {
  const loaded = await loadOpenClawConfig({ configPath: fixtureConfig });

  const portable = extractPortableAgentDefinition({
    config: loaded.config,
    configPath: loaded.configPath,
    workspacePath: fixtureWorkspace,
    agentId: 'supercoder',
  });

  assert.equal(portable.agent.suggestedId, 'supercoder');
  assert.equal(portable.agent.suggestedName, 'Supercoder');
  assert.equal(portable.agent.workspace.suggestedBasename, 'source-workspace');
  assert.ok(portable.agent.model, 'portable agent model should exist');
  assert.equal(portable.agent.model?.default, 'openai-codex/gpt-5.4');
  assert.ok(portable.notes.some((note) => note.includes('OpenClaw config')));
  assert.equal(portable.fieldClassification['agent.secrets'], 'excluded');
});

test('extractPortableAgentDefinition extracts from single-agent config', async () => {
  const configPath = await writeJsoncFixture(
    'extract-single.json',
    JSON.stringify({
      agent: {
        id: 'solo',
        name: 'Solo Agent',
        workspace: '~/.openclaw/workspace',
        model: { default: 'gpt-5' },
      },
    }),
  );

  const loaded = await loadOpenClawConfig({ configPath });
  const portable = extractPortableAgentDefinition({
    config: loaded.config,
    configPath,
    workspacePath: fixtureWorkspace,
    agentId: 'solo',
  });

  assert.equal(portable.agent.suggestedId, 'solo');
  assert.equal(portable.agent.suggestedName, 'Solo Agent');
  assert.equal(portable.agent.model?.default, 'gpt-5');
});

test('extractPortableAgentDefinition uses top-level identity as fallback', async () => {
  const configPath = await writeJsoncFixture(
    'top-level-identity.json',
    JSON.stringify({
      identity: { name: 'Global Name' },
      agent: { id: 'minimal', workspace: '/w' },
    }),
  );

  const loaded = await loadOpenClawConfig({ configPath });
  const portable = extractPortableAgentDefinition({
    config: loaded.config,
    configPath,
    workspacePath: fixtureWorkspace,
    agentId: 'minimal',
  });

  assert.equal(portable.agent.identity.name, 'Global Name');
});

test('extractPortableAgentDefinition throws for unknown agent id', async () => {
  const loaded = await loadOpenClawConfig({ configPath: fixtureConfig });
  assert.throws(
    () =>
      extractPortableAgentDefinition({
        config: loaded.config,
        configPath: loaded.configPath,
        workspacePath: fixtureWorkspace,
        agentId: 'nonexistent',
      }),
    /Agent not found/,
  );
});

// --- JSONC parsing ---

test('loadOpenClawConfig preserves // inside JSON string values', async () => {
  const configPath = await writeJsoncFixture(
    'string-line-comment-token.jsonc',
    `{
  "agents": {
    "list": [{ "id": "supercoder", "name": "https://example.com//agents/supercoder" }]
  }
}
`,
  );

  const loaded = await loadOpenClawConfig({ configPath });
  const agent = loaded.config.agents?.list?.find((a) => a.id === 'supercoder');
  assert.equal(agent?.name, 'https://example.com//agents/supercoder');
});

test('loadOpenClawConfig preserves /* */ inside JSON string values', async () => {
  const configPath = await writeJsoncFixture(
    'string-block-comment-token.jsonc',
    `{
  "agents": {
    "list": [{ "id": "supercoder", "name": "literal /* not a comment */ value" }]
  }
}
`,
  );

  const loaded = await loadOpenClawConfig({ configPath });
  const agent = loaded.config.agents?.list?.find((a) => a.id === 'supercoder');
  assert.equal(agent?.name, 'literal /* not a comment */ value');
});

test('loadOpenClawConfig still accepts real JSONC line and block comments', async () => {
  const configPath = await writeJsoncFixture(
    'actual-comments.jsonc',
    `{
  // agent catalog
  "agents": {
    /* exported agent list */
    "list": [{ "id": "supercoder", "name": "Supercoder" }]
  }
}
`,
  );

  const loaded = await loadOpenClawConfig({ configPath });
  const agent = loaded.config.agents?.list?.find((a) => a.id === 'supercoder');
  assert.equal(agent?.name, 'Supercoder');
});

// --- upsertPortableAgentDefinition ---

const portableFixture = {
  agent: {
    suggestedId: 'supercoder-imported',
    suggestedName: 'Supercoder Imported',
    workspace: { suggestedBasename: 'workspace-supercoder-imported' },
    identity: { name: 'Supercoder Imported' },
    model: { default: 'openai-codex/gpt-5.4' },
    tools: {
      profile: 'strict',
      allow: ['Read', 'Write'],
    },
    skills: ['brainstorming'],
    sandbox: {
      mode: 'workspace-write',
    },
    runtime: {
      transport: 'stdio',
    },
    params: {
      temperature: 0.2,
    },
  },
  fieldClassification: {
    'agent.suggestedId': 'requiresInputOnImport' as const,
    'agent.suggestedName': 'portable' as const,
    'agent.workspace.suggestedBasename': 'requiresInputOnImport' as const,
    'agent.identity.name': 'portable' as const,
    'agent.model.default': 'portable' as const,
  },
  notes: ['fixture'],
};

test('upsertPortableAgentDefinition creates new config with agents.list format', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });

  const result = await upsertPortableAgentDefinition({
    configPath: importConfig,
    portableAgentDefinition: portableFixture,
    targetAgentId: 'supercoder-imported',
    targetWorkspacePath: importWorkspace,
    force: false,
  });

  assert.equal(result.created, true);
  const written = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.ok(written.agents?.list, 'should write agents.list format');
  const entry = written.agents.list.find((a: { id: string }) => a.id === 'supercoder-imported');
  assert.ok(entry);
  assert.equal(entry.name, 'Supercoder Imported');
  assert.equal(entry.workspace, importWorkspace);
  assert.equal(entry.model.default, 'openai-codex/gpt-5.4');
  assert.deepEqual(entry.tools, portableFixture.agent.tools);
  assert.deepEqual(entry.skills, portableFixture.agent.skills);
  assert.deepEqual(entry.sandbox, portableFixture.agent.sandbox);
  assert.deepEqual(entry.runtime, portableFixture.agent.runtime);
  assert.deepEqual(entry.params, portableFixture.agent.params);
  assert.deepEqual(entry.heartbeat, portableFixture.agent.heartbeat);
  assert.deepEqual(entry.humanDelay, portableFixture.agent.humanDelay);
  assert.deepEqual(entry.memorySearch, portableFixture.agent.memorySearch);
  assert.equal(entry.channelBindings, undefined);
});

test('upsertPortableAgentDefinition appends to existing agents.list', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });
  await writeFile(
    importConfig,
    JSON.stringify({
      agents: { list: [{ id: 'existing', name: 'Existing', workspace: '/tmp/existing' }] },
    }),
  );

  await upsertPortableAgentDefinition({
    configPath: importConfig,
    portableAgentDefinition: portableFixture,
    targetAgentId: 'supercoder-imported',
    targetWorkspacePath: importWorkspace,
  });

  const written = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.equal(written.agents.list.length, 2);
  assert.equal(written.agents.list[0].id, 'existing');
  assert.equal(written.agents.list[1].id, 'supercoder-imported');
});

test('upsertPortableAgentDefinition converts single-agent to multi-agent on new id', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });
  await writeFile(
    importConfig,
    JSON.stringify({ agent: { id: 'original', name: 'Original', workspace: '/tmp/original' } }),
  );

  await upsertPortableAgentDefinition({
    configPath: importConfig,
    portableAgentDefinition: portableFixture,
    targetAgentId: 'supercoder-imported',
    targetWorkspacePath: importWorkspace,
  });

  const written = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.equal(written.agent, undefined, 'single-agent field should be removed');
  assert.ok(written.agents?.list);
  assert.equal(written.agents.list.length, 2);
  assert.equal(written.agents.list[0].id, 'original');
  assert.equal(written.agents.list[1].id, 'supercoder-imported');
});

test('upsertPortableAgentDefinition updates single-agent in place when same id', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });
  await writeFile(
    importConfig,
    JSON.stringify({ agent: { id: 'supercoder-imported', name: 'Old Name', workspace: '/old' } }),
  );

  await upsertPortableAgentDefinition({
    configPath: importConfig,
    portableAgentDefinition: portableFixture,
    targetAgentId: 'supercoder-imported',
    targetWorkspacePath: importWorkspace,
    force: true,
  });

  const written = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.ok(written.agent, 'should keep single-agent format');
  assert.equal(written.agent.name, 'Supercoder Imported');
  assert.equal(written.agent.workspace, importWorkspace);
});

test('upsertPortableAgentDefinition refuses duplicate without --force', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });
  await writeFile(
    importConfig,
    JSON.stringify({
      agents: {
        list: [{ id: 'supercoder-imported', name: 'Existing', workspace: '/tmp/existing' }],
      },
    }),
  );

  await assert.rejects(
    upsertPortableAgentDefinition({
      configPath: importConfig,
      portableAgentDefinition: portableFixture,
      targetAgentId: 'supercoder-imported',
      targetWorkspacePath: importWorkspace,
      force: false,
    }),
    /already exists/,
  );
});

// --- CLI integration: inspect ---

test('inspect command defaults to human-readable output and supports --json', async () => {
  await rm(inspectTarget, { force: true });

  const human = await runCli([
    'inspect',
    '--workspace',
    fixtureWorkspace,
    '--config',
    fixtureConfig,
    '--agent-id',
    'supercoder',
  ]);

  assert.match(human.stdout, /Workspace:/);
  assert.match(human.stdout, /Portable agent definition:/);
  assert.match(human.stdout, /Included files \(/);
  assert.match(human.stdout, /Bootstrap files \(/);
  assert.match(human.stdout, /Warnings:/);
  assert.equal(human.stdout.includes('{\n  "workspacePath"'), false);

  const json = await runCli([
    'inspect',
    '--workspace',
    fixtureWorkspace,
    '--config',
    fixtureConfig,
    '--agent-id',
    'supercoder',
    '--json',
  ]);

  const report = JSON.parse(json.stdout);
  assert.equal(report.workspacePath, fixtureWorkspace);
  assert.ok(report.includedFiles.includes('AGENTS.md'));
  assert.ok(
    report.excludedFiles.some(
      (entry: { relativePath: string }) => entry.relativePath === 'memory/2026-03-16.md',
    ),
  );
  assert.equal(report.portableConfig.found, true);
  assert.equal(report.portableConfig.agent.suggestedId, 'supercoder');
  assert.deepEqual(report.skills.referencedSkills, ['brainstorming']);
  assert.ok(report.warnings.some((warning: string) => warning.includes('Skills are manifest-only')));
});

// --- CLI integration: export/import/validate with config ---

test('export/import/validate uses fixture config and persists agent into target OpenClaw config', async () => {
  await rm(exportOut, { recursive: true, force: true });
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });

  await runCli([
    'export',
    '--workspace',
    fixtureWorkspace,
    '--config',
    fixtureConfig,
    '--agent-id',
    'supercoder',
    '--out',
    exportOut,
  ]);

  const agentJson = JSON.parse(
    await readFile(path.join(exportOut, 'config', 'agent.json'), 'utf8'),
  );
  assert.equal(agentJson.agent.model.default, 'openai-codex/gpt-5.4');
  assert.ok(agentJson.notes.some((note: string) => note.includes('OpenClaw config')));

  await runCli([
    'import',
    exportOut,
    '--target-workspace',
    importWorkspace,
    '--agent-id',
    'supercoder-imported',
    '--config',
    importConfig,
  ]);

  const importedConfig = JSON.parse(await readFile(importConfig, 'utf8'));
  const entry = importedConfig.agents?.list?.find(
    (a: { id: string }) => a.id === 'supercoder-imported',
  );
  assert.ok(entry, 'imported agent should be in agents.list');
  assert.equal(entry.workspace, importWorkspace);
  assert.deepEqual(entry.tools, agentJson.agent.tools);
  assert.deepEqual(entry.skills, agentJson.agent.skills);
  assert.deepEqual(entry.sandbox, agentJson.agent.sandbox);
  assert.deepEqual(entry.runtime, agentJson.agent.runtime);
  assert.deepEqual(entry.params, agentJson.agent.params);

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    importWorkspace,
    '--agent-id',
    'supercoder-imported',
    '--json',
  ]);
  const report = JSON.parse(stdout);
  assert.equal(report.failed.length, 0);
});
