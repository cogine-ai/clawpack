import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { scanWorkspace } from '../src/core/workspace-scan';
import { createTempWorkspace, cleanupTempWorkspace } from './helpers/workspace-factory';

const fixture = path.resolve('tests/fixtures/source-workspace');

test('scanWorkspace includes all files and excludes daily memory by default', async () => {
  const result = await scanWorkspace(fixture);
  assert.deepEqual(
    result.includedFiles.map((file) => file.relativePath),
    ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'notes.txt', 'SOUL.md', 'TOOLS.md', 'USER.md'],
  );
  assert.deepEqual(
    result.excludedFiles.map((file) => file.relativePath),
    ['memory/2026-03-16.md'],
  );
  for (const name of ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md']) {
    const file = result.includedFiles.find((f) => f.relativePath === name);
    assert.ok(file, `${name} should be in includedFiles`);
    assert.equal(file.isBootstrap, true, `${name} should be bootstrap`);
  }
  const notesTxt = result.includedFiles.find((f) => f.relativePath === 'notes.txt');
  assert.ok(notesTxt, 'notes.txt should be in includedFiles');
  assert.equal(notesTxt.isBootstrap, false, 'notes.txt should not be bootstrap');
});

test('scanWorkspace handles empty directory', async () => {
  const emptyDir = path.resolve('tests/tmp/ws-empty');
  await rm(emptyDir, { recursive: true, force: true });
  await mkdir(emptyDir, { recursive: true });
  try {
    const result = await scanWorkspace(emptyDir);
    assert.deepEqual(result.includedFiles, []);
    assert.deepEqual(result.excludedFiles, []);
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

test('scanWorkspace handles nonexistent path', async () => {
  const nonexistent = path.resolve('tests/tmp/ws-nonexistent-12345');
  await rm(nonexistent, { recursive: true, force: true });
  await assert.rejects(
    async () => scanWorkspace(nonexistent),
    { code: 'ENOENT' },
  );
});

test('scanWorkspace excludes only .md files from memory directory', async () => {
  const basePath = path.resolve('tests/tmp/ws-memory-md-only');
  await createTempWorkspace(basePath, {
    createMemoryDir: true,
    memoryFiles: { '2026-01-01.md': '# Daily\n', 'notes.txt': 'notes' },
  });
  try {
    const result = await scanWorkspace(basePath);
    assert.deepEqual(
      result.excludedFiles.map((f) => f.relativePath),
      ['memory/2026-01-01.md'],
    );
    assert.ok(!result.excludedFiles.some((f) => f.relativePath.includes('notes.txt')));
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});

test('scanWorkspace includes extra files with isBootstrap false', async () => {
  const basePath = path.resolve('tests/tmp/ws-extra-files');
  await createTempWorkspace(basePath, {
    extraFiles: { 'random.txt': 'x', 'config.yaml': 'y' },
  });
  try {
    const result = await scanWorkspace(basePath);
    const randomFile = result.includedFiles.find((f) => f.relativePath === 'random.txt');
    const configFile = result.includedFiles.find((f) => f.relativePath === 'config.yaml');
    assert.ok(randomFile, 'random.txt should be included');
    assert.equal(randomFile.isBootstrap, false);
    assert.ok(configFile, 'config.yaml should be included');
    assert.equal(configFile.isBootstrap, false);
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});

test('scanWorkspace recurses into subdirectories and includes files', async () => {
  const basePath = path.resolve('tests/tmp/ws-subdir-files');
  await createTempWorkspace(basePath, {
    extraFiles: { 'custom-dir/placeholder.txt': 'x' },
  });
  try {
    const result = await scanWorkspace(basePath);
    const subFile = result.includedFiles.find((f) => f.relativePath === 'custom-dir/placeholder.txt');
    assert.ok(subFile, 'custom-dir/placeholder.txt should be in includedFiles');
    assert.equal(subFile.isBootstrap, false);
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});

test('scanWorkspace handles optional files BOOTSTRAP.md and HEARTBEAT.md when present', async () => {
  const basePath = path.resolve('tests/tmp/ws-optional-files');
  await createTempWorkspace(basePath, {
    files: { 'BOOTSTRAP.md': '# BOOTSTRAP\n', 'HEARTBEAT.md': '# HEARTBEAT\n' },
  });
  try {
    const result = await scanWorkspace(basePath);
    const bootstrap = result.includedFiles.find((f) => f.relativePath === 'BOOTSTRAP.md');
    const heartbeat = result.includedFiles.find((f) => f.relativePath === 'HEARTBEAT.md');
    assert.ok(bootstrap, 'BOOTSTRAP.md should be in includedFiles');
    assert.equal(bootstrap.isBootstrap, true, 'BOOTSTRAP.md should be bootstrap');
    assert.ok(heartbeat, 'HEARTBEAT.md should be in includedFiles');
    assert.equal(heartbeat.isBootstrap, true, 'HEARTBEAT.md should be bootstrap');
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});
