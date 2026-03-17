import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  discoverOpenClawConfig,
  extractPortableAgentDefinition,
  loadOpenClawConfig,
  upsertPortableAgentDefinition,
} from '../src/core/openclaw-config';
import { runCli } from './helpers/run-cli';

const fixtureConfig = path.resolve('tests/fixtures/openclaw-config/source-config.jsonc');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
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

test('discover/load/extract reads minimal OpenClaw config fixture and returns portable agent slice', async () => {
  const discovered = await discoverOpenClawConfig({ configPath: fixtureConfig });
  assert.equal(discovered.configPath, fixtureConfig);

  const loaded = await loadOpenClawConfig({ configPath: fixtureConfig });
  assert.ok(loaded.config.agents, 'agents should exist');
  assert.ok(loaded.config.agents.supercoder, 'supercoder agent should exist');
  assert.equal(loaded.config.agents.supercoder.name, 'Supercoder');

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
  assert.equal(portable.agent.model.default, 'openai-codex/gpt-5.4');
  assert.ok(portable.notes.some((note) => note.includes('OpenClaw config')));
  assert.equal(portable.fieldClassification['agent.channelBindings'], 'excluded');
});

test('loadOpenClawConfig preserves // inside JSON string values', async () => {
  const configPath = await writeJsoncFixture('string-line-comment-token.jsonc', `{
  "agents": {
    "supercoder": {
      "name": "https://example.com//agents/supercoder"
    }
  }
}
`);

  const loaded = await loadOpenClawConfig({ configPath });
  assert.equal(loaded.config.agents?.supercoder?.name, 'https://example.com//agents/supercoder');
});

test('loadOpenClawConfig preserves /* */ inside JSON string values', async () => {
  const configPath = await writeJsoncFixture('string-block-comment-token.jsonc', `{
  "agents": {
    "supercoder": {
      "name": "literal /* not a comment */ value"
    }
  }
}
`);

  const loaded = await loadOpenClawConfig({ configPath });
  assert.equal(loaded.config.agents?.supercoder?.name, 'literal /* not a comment */ value');
});

test('loadOpenClawConfig still accepts real JSONC line and block comments', async () => {
  const configPath = await writeJsoncFixture('actual-comments.jsonc', `{
  // agent catalog
  "agents": {
    /* exported agent */
    "supercoder": {
      "name": "Supercoder"
    }
  }
}
`);

  const loaded = await loadOpenClawConfig({ configPath });
  assert.equal(loaded.config.agents?.supercoder?.name, 'Supercoder');
});

test('upsertPortableAgentDefinition writes a scoped portable agent entry into target config', async () => {
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });

  const portable = {
    agent: {
      suggestedId: 'supercoder-imported',
      suggestedName: 'Supercoder Imported',
      workspace: { suggestedBasename: 'workspace-supercoder-imported' },
      identity: { name: 'Supercoder Imported' },
      model: { default: 'openai-codex/gpt-5.4' },
    },
    fieldClassification: {
      'agent.suggestedId': 'requiresInputOnImport',
      'agent.suggestedName': 'portable',
      'agent.workspace.suggestedBasename': 'requiresInputOnImport',
      'agent.identity.name': 'portable',
      'agent.model.default': 'portable',
    },
    notes: ['fixture'],
  };

  const result = await upsertPortableAgentDefinition({
    configPath: importConfig,
    portableAgentDefinition: portable,
    targetAgentId: 'supercoder-imported',
    targetWorkspacePath: importWorkspace,
    force: false,
  });

  assert.equal(result.created, true);
  const written = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.equal(written.agents['supercoder-imported'].name, 'Supercoder Imported');
  assert.equal(written.agents['supercoder-imported'].workspace, importWorkspace);
  assert.equal(written.agents['supercoder-imported'].model.default, 'openai-codex/gpt-5.4');
  assert.equal(written.agents['supercoder-imported'].channelBindings, undefined);
});

test('inspect command defaults to human-readable output and supports --json', async () => {
  await rm(inspectTarget, { force: true });

  const human = await runCli([
    'inspect',
    '--workspace', fixtureWorkspace,
    '--config', fixtureConfig,
    '--agent-id', 'supercoder',
  ]);

  assert.match(human.stdout, /Workspace:/);
  assert.match(human.stdout, /Portable agent definition:/);
  assert.match(human.stdout, /Included files \(/);
  assert.match(human.stdout, /Warnings:/);
  assert.equal(human.stdout.includes('{\n  "workspacePath"'), false);

  const json = await runCli([
    'inspect',
    '--workspace', fixtureWorkspace,
    '--config', fixtureConfig,
    '--agent-id', 'supercoder',
    '--json',
  ]);

  const report = JSON.parse(json.stdout);
  assert.equal(report.workspacePath, fixtureWorkspace);
  assert.ok(report.includedFiles.includes('AGENTS.md'));
  assert.ok(report.excludedFiles.some((entry: { relativePath: string }) => entry.relativePath === 'memory/2026-03-16.md'));
  assert.equal(report.portableConfig.found, true);
  assert.equal(report.portableConfig.agent.suggestedId, 'supercoder');
  assert.ok(report.skills.referencedSkills.includes('github'));
  assert.ok(report.warnings.some((warning: string) => warning.includes('Channel bindings')));
});

test('export/import/validate uses fixture config and persists agent into target OpenClaw config', async () => {
  await rm(exportOut, { recursive: true, force: true });
  await rm(importTargetRoot, { recursive: true, force: true });
  await mkdir(importTargetRoot, { recursive: true });

  await runCli([
    'export',
    '--workspace', fixtureWorkspace,
    '--config', fixtureConfig,
    '--agent-id', 'supercoder',
    '--out', exportOut,
  ]);

  const agentJson = JSON.parse(await readFile(path.join(exportOut, 'config', 'agent.json'), 'utf8'));
  assert.equal(agentJson.agent.model.default, 'openai-codex/gpt-5.4');
  assert.ok(agentJson.notes.some((note: string) => note.includes('OpenClaw config')));

  await runCli([
    'import',
    exportOut,
    '--target-workspace', importWorkspace,
    '--agent-id', 'supercoder-imported',
    '--config', importConfig,
  ]);

  const importedConfig = JSON.parse(await readFile(importConfig, 'utf8'));
  assert.equal(importedConfig.agents['supercoder-imported'].workspace, importWorkspace);

  const { stdout } = await runCli([
    'validate',
    '--target-workspace', importWorkspace,
    '--agent-id', 'supercoder-imported',
  ]);
  const report = JSON.parse(stdout);
  assert.equal(report.failed.length, 0);
});
