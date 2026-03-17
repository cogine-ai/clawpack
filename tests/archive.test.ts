import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { cleanupTempDir } from '../src/core/archive';
import { readPackage } from '../src/core/package-read';
import { runCli } from './helpers/run-cli';

const fixture = path.resolve('tests/fixtures/source-workspace');
const dirOutput = path.resolve('tests/tmp/archive-test-dir.ocpkg');
const archiveOutput = path.resolve('tests/tmp/archive-test-dir.ocpkg.tar.gz');
const archiveImportTarget = path.resolve('tests/tmp/archive-import-target/workspace-archive');

test('export --archive produces a .ocpkg.tar.gz file', async () => {
  await rm(dirOutput, { recursive: true, force: true });
  await rm(archiveOutput, { force: true });

  await runCli(['export', '--workspace', fixture, '--out', dirOutput, '--archive']);

  assert.equal(existsSync(archiveOutput), true, 'archive file should exist');
  const archiveStat = await stat(archiveOutput);
  assert.ok(archiveStat.isFile(), 'archive should be a file');
  assert.ok(archiveStat.size > 0, 'archive should not be empty');

  assert.equal(existsSync(dirOutput), false, 'staging directory should be cleaned up');
});

test('export --archive output has correct .ocpkg.tar.gz suffix and CLI reports archive path', async () => {
  await rm(archiveOutput, { force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace',
    fixture,
    '--out',
    dirOutput,
    '--archive',
    '--json',
  ]);
  const result = JSON.parse(stdout);

  assert.ok(
    result.packageRoot.endsWith('.ocpkg.tar.gz'),
    'packageRoot should end with .ocpkg.tar.gz',
  );
  assert.equal(result.status, 'ok');
  assert.ok(result.fileCount > 0);
});

test('readPackage detects and extracts .tar.gz archive', async () => {
  await rm(archiveOutput, { force: true });
  await runCli(['export', '--workspace', fixture, '--out', dirOutput, '--archive']);

  let capturedTempDir: string | undefined;
  const pkg = await readPackage(archiveOutput, {
    onTempDir(dir) {
      capturedTempDir = dir;
    },
  });

  assert.ok(capturedTempDir, 'onTempDir callback should be called for archive input');
  assert.equal(pkg.manifest.packageType, 'openclaw-agent-template');
  assert.ok(pkg.workspaceFiles.length >= 6, 'should have at least 6 workspace files');
  assert.ok(pkg.checksums['config/agent.json'].length === 64, 'checksum should be SHA-256');

  await cleanupTempDir(capturedTempDir);
});

test('readPackage reads a directory without onTempDir callback', async () => {
  await rm(dirOutput, { recursive: true, force: true });
  await runCli(['export', '--workspace', fixture, '--out', dirOutput]);

  let tempDirCalled = false;
  const pkg = await readPackage(dirOutput, {
    onTempDir() {
      tempDirCalled = true;
    },
  });

  assert.equal(tempDirCalled, false, 'onTempDir should not be called for directory input');
  assert.equal(pkg.manifest.packageType, 'openclaw-agent-template');
});

test('archive roundtrip: export --archive -> import -> validate succeeds', async () => {
  await rm(archiveOutput, { force: true });
  await rm(archiveImportTarget, { recursive: true, force: true });
  await rm(path.dirname(archiveImportTarget), { recursive: true, force: true });

  await runCli(['export', '--workspace', fixture, '--out', dirOutput, '--archive']);
  await runCli([
    'import',
    archiveOutput,
    '--target-workspace',
    archiveImportTarget,
    '--agent-id',
    'archive-test-agent',
  ]);

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    archiveImportTarget,
    '--agent-id',
    'archive-test-agent',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.failed.length, 0, 'validation should have no failures');
  assert.ok(report.warnings.some((w: string) => w.includes('Skills are manifest-only')));

  assert.equal(
    existsSync(path.join(archiveImportTarget, 'AGENTS.md')),
    true,
    'imported workspace should have AGENTS.md',
  );
  assert.equal(
    existsSync(path.join(archiveImportTarget, 'MEMORY.md')),
    true,
    'imported workspace should have MEMORY.md',
  );
});

test('export without --archive still produces directory format (backward compat)', async () => {
  await rm(dirOutput, { recursive: true, force: true });

  await runCli(['export', '--workspace', fixture, '--out', dirOutput]);

  const dirStat = await stat(dirOutput);
  assert.ok(dirStat.isDirectory(), 'output should be a directory');
  assert.equal(existsSync(path.join(dirOutput, 'manifest.json')), true);
  assert.equal(existsSync(path.join(dirOutput, 'workspace', 'AGENTS.md')), true);
});

test('archive import via CLI succeeds end-to-end', async () => {
  await rm(archiveOutput, { force: true });
  await rm(archiveImportTarget, { recursive: true, force: true });
  await rm(path.dirname(archiveImportTarget), { recursive: true, force: true });

  await runCli(['export', '--workspace', fixture, '--out', dirOutput, '--archive']);

  const { stdout: importStdout } = await runCli([
    'import',
    archiveOutput,
    '--target-workspace',
    archiveImportTarget,
    '--agent-id',
    'cleanup-test-agent',
    '--json',
  ]);

  const importResult = JSON.parse(importStdout);
  assert.equal(importResult.status, 'ok');

  assert.equal(
    existsSync(path.join(archiveImportTarget, 'AGENTS.md')),
    true,
    'import should have completed successfully',
  );
});
