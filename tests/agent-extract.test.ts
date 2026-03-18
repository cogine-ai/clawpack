import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { extractAgentDefinition } from '../src/core/agent-extract';

const fixtureConfig = path.resolve('tests/fixtures/openclaw-config/source-config.jsonc');
const fixtureWorkspace = path.resolve('tests/fixtures/source-workspace');
const tmpRoot = path.resolve('tests/tmp');

test('extracts agent from agents.list config fixture', async () => {
  const result = await extractAgentDefinition(fixtureWorkspace, {
    configPath: fixtureConfig,
    agentId: 'supercoder',
  });

  assert.equal(result.agent.suggestedId, 'supercoder');
  assert.equal(result.agent.suggestedName, 'Supercoder');
  assert.equal(result.agent.workspace.suggestedBasename, 'source-workspace');
  assert.ok(result.agent.model);
  assert.equal(result.agent.model?.default, 'openai-codex/gpt-5.4');
  assert.ok(result.notes.some((note) => note.includes('OpenClaw config')));
});

test('extracts from single-agent config format', async () => {
  const configPath = path.join(tmpRoot, 'agent-extract-single.json');
  await mkdir(tmpRoot, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'solo',
        name: 'Solo Agent',
        workspace: '/tmp/test',
        model: { default: 'gpt-5' },
      },
    }),
    'utf8',
  );

  const workspacePath = path.join(tmpRoot, 'test');
  const result = await extractAgentDefinition(workspacePath, {
    configPath,
    agentId: 'solo',
  });

  assert.equal(result.agent.suggestedId, 'solo');
  assert.equal(result.agent.suggestedName, 'Solo Agent');
  assert.equal(result.agent.model?.default, 'gpt-5');
});

test('falls back to basename when no config exists', async () => {
  const workspacePath = path.resolve('tests/tmp/workspace-test-agent');
  await mkdir(workspacePath, { recursive: true });

  // Pass nonexistent config path to simulate "no config" (avoids env/default config discovery)
  const result = await extractAgentDefinition(workspacePath, {
    configPath: path.join(tmpRoot, 'no-such-config.json'),
  });

  assert.equal(result.agent.suggestedId, 'test-agent');
  assert.equal(result.agent.suggestedName, 'Test Agent');
  assert.ok(result.notes.some((note) => note.includes('workspace basename')));
});

test('falls back to basename when config path points to nonexistent file', async () => {
  const workspacePath = path.resolve('tests/tmp/workspace-fallback');
  await mkdir(workspacePath, { recursive: true });

  const result = await extractAgentDefinition(workspacePath, {
    configPath: path.join(tmpRoot, 'nonexistent-config.json'),
  });

  assert.equal(result.agent.suggestedId, 'fallback');
  assert.equal(result.agent.suggestedName, 'Fallback');
});

test('uses specified agentId parameter when provided', async () => {
  const configPath = path.join(tmpRoot, 'agent-extract-multi.json');
  await mkdir(tmpRoot, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({
      agents: {
        list: [
          { id: 'alpha', name: 'Alpha', workspace: '/tmp/alpha', model: { default: 'gpt-4' } },
          { id: 'beta', name: 'Beta', workspace: '/tmp/beta', model: { default: 'gpt-5' } },
        ],
      },
    }),
    'utf8',
  );

  const workspacePath = path.join(tmpRoot, 'beta');
  const result = await extractAgentDefinition(workspacePath, {
    configPath,
    agentId: 'beta',
  });

  assert.equal(result.agent.suggestedId, 'beta');
  assert.equal(result.agent.suggestedName, 'Beta');
  assert.equal(result.agent.model?.default, 'gpt-5');
});
