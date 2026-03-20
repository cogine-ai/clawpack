import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { writePackageDirectory } from '../src/core/package-write';
import { scanWorkspace } from '../src/core/workspace-scan';
import { detectSkills } from '../src/core/skills-detect';
import { extractAgentDefinition } from '../src/core/agent-extract';
import { scanRuntime } from '../src/core/runtime-scan';
import { createTempWorkspace } from './helpers/workspace-factory';

const tmpBase = path.resolve('tests/tmp/runtime-pkg');

test('writePackageDirectory writes runtime subtree when runtimeScan provided', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'ws'));
  const agentDir = path.join(tmpBase, 'agentdir');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'settings.json'), '{"theme":"dark"}', 'utf8');
  await writeFile(path.join(agentDir, 'AGENTS.md'), '# Agents', 'utf8');
  await mkdir(path.join(agentDir, 'prompts'), { recursive: true });
  await writeFile(path.join(agentDir, 'prompts', 'system.md'), '# System', 'utf8');

  const scan = await scanWorkspace(wsPath);
  const skills = await detectSkills(scan);
  const agent = await extractAgentDefinition(wsPath);
  const runtimeScan = await scanRuntime({ mode: 'default', agentDir, workspacePath: wsPath });

  const outputPath = path.join(tmpBase, 'output.ocpkg');
  await rm(outputPath, { recursive: true, force: true });
  await writePackageDirectory({
    outputPath,
    packageName: 'runtime-test',
    scan,
    skills,
    agentDefinition: agent,
    runtimeScan,
  });

  assert.ok(existsSync(path.join(outputPath, 'runtime', 'manifest.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'checksums.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'path-rewrites.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'settings.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'AGENTS.md')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'prompts', 'system.md')));

  const runtimeManifest = JSON.parse(
    await readFile(path.join(outputPath, 'runtime', 'manifest.json'), 'utf8'),
  );
  assert.equal(runtimeManifest.mode, 'default');
  assert.ok(runtimeManifest.includedFiles.includes('settings.json'));
});

test('writePackageDirectory omits runtime subtree when no runtimeScan', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'ws-nort'));
  const scan = await scanWorkspace(wsPath);
  const skills = await detectSkills(scan);
  const agent = await extractAgentDefinition(wsPath);

  const outputPath = path.join(tmpBase, 'output-nort.ocpkg');
  await rm(outputPath, { recursive: true, force: true });
  await writePackageDirectory({
    outputPath,
    packageName: 'no-runtime-test',
    scan,
    skills,
    agentDefinition: agent,
  });

  assert.equal(existsSync(path.join(outputPath, 'runtime')), false);
});

test('writePackageDirectory includes settings-analysis.json when analysis exists', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'ws-sa'));
  const agentDir = path.join(tmpBase, 'agentdir-sa');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'settings.json'),
    JSON.stringify({ 'data.path': '/usr/local/data' }),
    'utf8',
  );

  const scan = await scanWorkspace(wsPath);
  const skills = await detectSkills(scan);
  const agent = await extractAgentDefinition(wsPath);
  const runtimeScan = await scanRuntime({ mode: 'default', agentDir, workspacePath: wsPath });

  const outputPath = path.join(tmpBase, 'output-sa.ocpkg');
  await rm(outputPath, { recursive: true, force: true });
  await writePackageDirectory({
    outputPath,
    packageName: 'settings-analysis-test',
    scan,
    skills,
    agentDefinition: agent,
    runtimeScan,
  });

  assert.ok(existsSync(path.join(outputPath, 'runtime', 'settings-analysis.json')));
  const analysis = JSON.parse(
    await readFile(path.join(outputPath, 'runtime', 'settings-analysis.json'), 'utf8'),
  );
  assert.ok(analysis.pathRefs);
  assert.ok(analysis.summary);
});

test('writePackageDirectory writes sanitized models.json instead of raw', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'ws-models'));
  const agentDir = path.join(tmpBase, 'agentdir-models');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'models.json'),
    JSON.stringify({ models: [{ id: 'gpt-4', apiKey: 'sk-xxx', maxTokens: 4096 }] }),
    'utf8',
  );

  const scan = await scanWorkspace(wsPath);
  const skills = await detectSkills(scan);
  const agent = await extractAgentDefinition(wsPath);
  const runtimeScan = await scanRuntime({ mode: 'default', agentDir, workspacePath: wsPath });

  const outputPath = path.join(tmpBase, 'output-models.ocpkg');
  await rm(outputPath, { recursive: true, force: true });
  await writePackageDirectory({
    outputPath,
    packageName: 'models-test',
    scan,
    skills,
    agentDefinition: agent,
    runtimeScan,
  });

  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'models.json')));
  const models = JSON.parse(
    await readFile(path.join(outputPath, 'runtime', 'files', 'models.json'), 'utf8'),
  );
  assert.equal(models.models[0].apiKey, undefined);
  assert.equal(models.models[0].maxTokens, 4096);
});

test('manifest.includes.runtimeMode reflects runtime mode', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'ws-manifest'));
  const agentDir = path.join(tmpBase, 'agentdir-manifest');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');

  const scan = await scanWorkspace(wsPath);
  const skills = await detectSkills(scan);
  const agent = await extractAgentDefinition(wsPath);
  const runtimeScan = await scanRuntime({ mode: 'default', agentDir, workspacePath: wsPath });

  const outputPath = path.join(tmpBase, 'output-manifest.ocpkg');
  await rm(outputPath, { recursive: true, force: true });
  await writePackageDirectory({
    outputPath,
    packageName: 'manifest-runtime-test',
    scan,
    skills,
    agentDefinition: agent,
    runtimeScan,
  });

  const manifest = JSON.parse(
    await readFile(path.join(outputPath, 'manifest.json'), 'utf8'),
  );
  assert.equal(manifest.includes.runtimeMode, 'default');
});
