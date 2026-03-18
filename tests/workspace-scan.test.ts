import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { scanWorkspace } from '../src/core/workspace-scan';
import { createTempWorkspace, cleanupTempWorkspace } from './helpers/workspace-factory';

const fixture = path.resolve('tests/fixtures/source-workspace');

test('scanWorkspace includes core files and excludes daily memory by default', async () => {
  const result = await scanWorkspace(fixture);
  assert.deepEqual(
    result.includedFiles.map((file) => file.relativePath),
    ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'],
  );
  assert.deepEqual(result.missingOptionalFiles, ['BOOTSTRAP.md', 'HEARTBEAT.md']);
  assert.deepEqual(
    result.excludedFiles.map((file) => file.relativePath),
    ['memory/2026-03-16.md'],
  );
  assert.ok(result.ignoredFiles.includes('notes.txt'));
});

test('scanWorkspace handles empty directory', async () => {
  const emptyDir = path.resolve('tests/tmp/ws-empty');
  await rm(emptyDir, { recursive: true, force: true });
  await mkdir(emptyDir, { recursive: true });
  try {
    const result = await scanWorkspace(emptyDir);
    assert.deepEqual(result.includedFiles, []);
    assert.deepEqual(result.excludedFiles, []);
    assert.deepEqual(result.missingOptionalFiles, ['BOOTSTRAP.md', 'HEARTBEAT.md']);
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
});

test('scanWorkspace handles nonexistent path', async () => {
  const nonexistent = path.resolve('tests/tmp/ws-nonexistent-12345');
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

test('scanWorkspace reports extra non-allowed files in ignoredFiles', async () => {
  const basePath = path.resolve('tests/tmp/ws-ignored-files');
  await createTempWorkspace(basePath, {
    extraFiles: { 'random.txt': 'x', 'config.yaml': 'y' },
  });
  try {
    const result = await scanWorkspace(basePath);
    assert.ok(result.ignoredFiles.includes('config.yaml'));
    assert.ok(result.ignoredFiles.includes('random.txt'));
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});

test('scanWorkspace reports non-memory subdirectories in ignoredFiles', async () => {
  const basePath = path.resolve('tests/tmp/ws-ignored-dir');
  await createTempWorkspace(basePath, {
    extraFiles: { 'custom-dir/placeholder.txt': 'x' },
  });
  try {
    const result = await scanWorkspace(basePath);
    assert.ok(result.ignoredFiles.includes('custom-dir'));
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
    assert.deepEqual(result.missingOptionalFiles, []);
    assert.ok(result.includedFiles.some((f) => f.relativePath === 'BOOTSTRAP.md'));
    assert.ok(result.includedFiles.some((f) => f.relativePath === 'HEARTBEAT.md'));
  } finally {
    await cleanupTempWorkspace(basePath);
  }
});
