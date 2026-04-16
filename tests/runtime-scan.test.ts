import assert from 'node:assert/strict';
import { chmod, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { scanRuntime } from '../src/core/runtime-scan';

const tmpBase = path.resolve('tests/tmp/runtime-scan');

async function setupAgentDir(files: Record<string, string>): Promise<string> {
  const dir = path.join(tmpBase, `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await rm(dir, { recursive: true, force: true });
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }
  return dir;
}

test('scanRuntime mode=none returns empty results', async () => {
  const agentDir = await setupAgentDir({ 'settings.json': '{}' });
  const result = await scanRuntime({ mode: 'none', agentDir, workspacePath: '/tmp/ws' });
  assert.equal(result.mode, 'none');
  assert.equal(result.includedFiles.length, 0);
  assert.equal(result.excludedFiles.length, 0);
});

test('scanRuntime mode=default includes grounded models.json only', async () => {
  const agentDir = await setupAgentDir({
    'AGENTS.md': '# Agents',
    'settings.json': '{}',
    'models.json': JSON.stringify({ models: [{ id: 'gpt-5', apiKey: 'sk-xxx' }] }),
    'auth.json': '{ "token": "secret" }',
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.equal(result.mode, 'default');
  assert.ok(result.includedFiles.some(f => f.relativePath === 'models.json'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'AGENTS.md'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'settings.json'));
  assert.deepEqual(result.artifacts.grounded, ['models.json']);
  assert.ok(result.artifacts.inferred.includes('settings.json'));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'auth.json'));
});

test('scanRuntime mode=default excludes inferred prompts/** and themes/**', async () => {
  const agentDir = await setupAgentDir({
    'prompts/system.md': '# System prompt',
    'prompts/user.md': '# User prompt',
    'themes/dark.json': '{}',
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'prompts/system.md'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'prompts/user.md'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'themes/dark.json'));
  assert.deepEqual(result.artifacts.inferred, ['prompts/system.md', 'prompts/user.md', 'themes/dark.json']);
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'prompts/system.md' && /inferred|full mode/i.test(f.reason)));
});

test('scanRuntime mode=default excludes unsupported skills/** and extensions/** with explicit reasons', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'skills/my-skill/SKILL.md': '# Skill',
    'extensions/ext1/package.json': '{}',
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(!result.includedFiles.some(f => f.relativePath.startsWith('skills/')));
  assert.ok(!result.includedFiles.some(f => f.relativePath.startsWith('extensions/')));
  assert.deepEqual(result.artifacts.unsupported, ['extensions/ext1/package.json', 'skills/my-skill/SKILL.md']);
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'skills/my-skill/SKILL.md' && /unsupported/i.test(f.reason)));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'extensions/ext1/package.json' && /unsupported/i.test(f.reason)));
});

test('scanRuntime mode=full includes inferred settings/prompts/themes but still excludes unsupported skills/extensions', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'prompts/system.md': '# System',
    'themes/dark.json': '{}',
    'skills/my-skill/SKILL.md': '# Skill',
    'extensions/ext1/package.json': '{}',
  });
  const result = await scanRuntime({ mode: 'full', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(result.includedFiles.some(f => f.relativePath === 'settings.json'));
  assert.ok(result.includedFiles.some(f => f.relativePath === 'prompts/system.md'));
  assert.ok(result.includedFiles.some(f => f.relativePath === 'themes/dark.json'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'skills/my-skill/SKILL.md'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'extensions/ext1/package.json'));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'skills/my-skill/SKILL.md' && /unsupported/i.test(f.reason)));
});

test('scanRuntime always excludes auth-profiles.json and sessions/**', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'auth-profiles.json': '{}',
    'sessions/session1.json': '{}',
  });
  const result = await scanRuntime({ mode: 'full', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'auth-profiles.json'));
  assert.ok(!result.includedFiles.some(f => f.relativePath.startsWith('sessions/')));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'auth-profiles.json'));
});

test('scanRuntime sanitizes grounded models.json and includes sanitized version in default mode', async () => {
  const agentDir = await setupAgentDir({
    'models.json': JSON.stringify({
      models: [{ id: 'gpt-4', provider: 'openai', apiKey: 'sk-xxx', maxTokens: 4096 }],
    }),
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(result.sanitizedModels);
  assert.ok(result.includedFiles.some(f => f.relativePath === 'models.json'));
  assert.equal((result.sanitizedModels as any).models[0].apiKey, undefined);
  assert.equal((result.sanitizedModels as any).models[0].maxTokens, 4096);
});

test('scanRuntime skips models.json when nothing useful remains after sanitization and records exclusion', async () => {
  const agentDir = await setupAgentDir({
    'models.json': JSON.stringify({ models: [{ apiKey: 'sk-xxx' }] }),
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.equal(result.sanitizedModels, undefined);
  assert.ok(result.warnings.some(w => w.includes('models.json')));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'models.json'));
});

test('scanRuntime records excluded models.json when parsing fails', async () => {
  const agentDir = await setupAgentDir({
    'models.json': '{ invalid json',
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.equal(result.sanitizedModels, undefined);
  assert.ok(result.warnings.some(w => /models\.json could not be parsed/i.test(w)));
  assert.ok(result.excludedFiles.some(f => f.relativePath === 'models.json' && /parse/i.test(f.reason)));
});

test('scanRuntime analyzes settings.json paths when inferred files are included in full mode', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': JSON.stringify({ 'data.path': '/usr/local/data' }),
  });
  const result = await scanRuntime({ mode: 'full', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(result.settingsAnalysis);
  assert.equal(result.settingsAnalysis!.pathRefs.length, 1);
});

test('scanRuntime excludes temp and log files via extension', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'prompts/draft.tmp': 'temp data',
    'prompts/run.log': 'log data',
    'prompts/lock.lock': 'lock data',
  });
  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });
  assert.ok(!result.includedFiles.some(f => f.relativePath.endsWith('.tmp')));
  assert.ok(!result.includedFiles.some(f => f.relativePath.endsWith('.log')));
  assert.ok(!result.includedFiles.some(f => f.relativePath.endsWith('.lock')));
});

test('scanRuntime skips symlinked files and directories', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
  });
  const externalDir = path.join(tmpBase, `external-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await rm(externalDir, { recursive: true, force: true });
  await mkdir(path.join(externalDir, 'themes'), { recursive: true });
  await writeFile(path.join(externalDir, 'linked.md'), '# linked', 'utf8');
  await writeFile(path.join(externalDir, 'themes', 'dark.json'), '{}', 'utf8');
  await mkdir(path.join(agentDir, 'prompts'), { recursive: true });
  await symlink(path.join(externalDir, 'linked.md'), path.join(agentDir, 'prompts', 'linked.md'));
  await symlink(path.join(externalDir, 'themes'), path.join(agentDir, 'themes'));

  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });

  assert.ok(!result.includedFiles.some(f => f.relativePath === 'prompts/linked.md'));
  assert.ok(!result.includedFiles.some(f => f.relativePath === 'themes/dark.json'));
});

test('scanRuntime reports directory read failures in warnings', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'prompts/keep.md': '# keep',
  });

  const blockedDir = path.join(agentDir, 'prompts', 'blocked');
  await mkdir(blockedDir, { recursive: true });
  await writeFile(path.join(blockedDir, 'hidden.md'), '# hidden', 'utf8');
  await chmod(blockedDir, 0o000);

  try {
    const result = await scanRuntime({ mode: 'full', agentDir, workspacePath: '/tmp/ws' });

    assert.ok(result.includedFiles.some(f => f.relativePath === 'prompts/keep.md'));
    assert.ok(result.warnings.some(w => /blocked/.test(w)));
  } finally {
    await chmod(blockedDir, 0o755);
  }
});

test('scanRuntime does not treat a file named like an allowlist directory as a descendant match', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'prompts': 'plain file, not a directory',
  });

  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });

  assert.ok(!result.includedFiles.some(f => f.relativePath === 'prompts'));
});

test('scanRuntime returns included files in deterministic sorted order', async () => {
  const agentDir = await setupAgentDir({
    'settings.json': '{}',
    'AGENTS.md': '# Agents',
    'models.json': JSON.stringify({ models: [{ id: 'gpt-5', apiKey: 'sk-xxx' }] }),
    'prompts/z-last.md': '# Z',
    'prompts/a-first.md': '# A',
  });

  const result = await scanRuntime({ mode: 'default', agentDir, workspacePath: '/tmp/ws' });

  assert.deepEqual(
    result.includedFiles.map(f => f.relativePath),
    ['models.json'],
  );
});

test('scanRuntime handles nonexistent agentDir gracefully', async () => {
  const result = await scanRuntime({
    mode: 'default',
    agentDir: '/nonexistent/path/that/does/not/exist',
    workspacePath: '/tmp/ws',
  });
  assert.equal(result.includedFiles.length, 0);
  assert.ok(result.warnings.some(w => w.includes('does not exist')));
});
