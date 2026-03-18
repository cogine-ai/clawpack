import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { readPackageDirectory } from '../src/core/package-read';
import { runCli } from './helpers/run-cli';

const fixture = path.resolve('tests/fixtures/source-workspace');
const outputRoot = path.resolve('tests/tmp/exported-fixture.ocpkg');
const targetRoot = path.resolve('tests/tmp/roundtrip-target/workspace-supercoder-copy');

test('export command writes package directory structure and excludes daily memory', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await runCli(['export', '--workspace', fixture, '--out', outputRoot]);

  for (const requiredPath of [
    'manifest.json',
    'config/skills-manifest.json',
    'config/agent.json',
    'meta/checksums.json',
    'meta/export-report.json',
    'workspace/AGENTS.md',
    'workspace/MEMORY.md',
  ]) {
    assert.equal(existsSync(path.join(outputRoot, requiredPath)), true, `${requiredPath} should exist`);
  }

  assert.equal(existsSync(path.join(outputRoot, 'workspace', 'memory', '2026-03-16.md')), false);

  const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
  assert.equal(manifest.includes.skills, 'manifest-only');
  assert.match(manifest.metadata.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(manifest.metadata.createdBy.name, '@cogineai/clawpacker');
  assert.equal(typeof manifest.metadata.createdBy.version, 'string');
  assert.equal(manifest.metadata.platform.os, process.platform);
  assert.equal(manifest.metadata.platform.arch, process.arch);
  assert.equal(manifest.metadata.platform.node, process.version);
  assert.match(manifest.metadata.contentHash, /^[a-f0-9]{64}$/);
});

test('package reader opens a valid exported package and verifies checksums', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await runCli(['export', '--workspace', fixture, '--out', outputRoot]);

  const pkg = await readPackageDirectory(outputRoot);
  assert.equal(pkg.manifest.packageType, 'openclaw-agent-template');
  assert.equal(pkg.workspaceFiles.length >= 6, true);
  assert.equal(pkg.checksums['config/agent.json'].length, 64);
});

test('package reader tolerates manifests from older packages with missing additive metadata', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await runCli(['export', '--workspace', fixture, '--out', outputRoot]);

  const manifestPath = path.join(outputRoot, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.metadata;
  delete manifest.source.openclawVersion;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const pkg = await readPackageDirectory(outputRoot);
  assert.equal(pkg.manifest.metadata, undefined);
  assert.equal(pkg.manifest.source.openclawVersion, undefined);
  assert.equal(pkg.workspaceFiles.length >= 6, true);
});

test('export command defaults to human-readable output and supports --json', async () => {
  await rm(outputRoot, { recursive: true, force: true });

  const human = await runCli(['export', '--workspace', fixture, '--out', outputRoot]);
  assert.match(human.stdout, /Export complete/);
  assert.match(human.stdout, /Package:/);
  assert.match(human.stdout, /Manifest:/);
  assert.match(human.stdout, /Files:/);
  assert.equal(human.stdout.includes('"status"'), false);

  await rm(outputRoot, { recursive: true, force: true });

  const json = await runCli(['export', '--workspace', fixture, '--out', outputRoot, '--json']);
  const report = JSON.parse(json.stdout);
  assert.equal(report.status, 'ok');
  assert.ok(report.packageRoot);
  assert.ok(report.manifestPath);
  assert.equal(typeof report.fileCount, 'number');
});

test('import success defaults to human-readable output and supports --json', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });
  await runCli(['export', '--workspace', fixture, '--out', outputRoot]);

  const human = await runCli([
    'import',
    outputRoot,
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
  ]);
  assert.match(human.stdout, /Import complete/);
  assert.match(human.stdout, /Workspace:/);
  assert.match(human.stdout, /Agent id: supercoder-copy/);
  assert.match(human.stdout, /Imported files:/);
  assert.equal(human.stdout.includes('"status"'), false);

  await rm(path.dirname(targetRoot), { recursive: true, force: true });

  const json = await runCli([
    'import',
    outputRoot,
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--json',
  ]);
  const report = JSON.parse(json.stdout);
  assert.equal(report.status, 'ok');
  assert.equal(report.agentId, 'supercoder-copy');
  assert.ok(Array.isArray(report.importedFiles));
  assert.ok(Array.isArray(report.nextSteps));
});

test('roundtrip export -> import -> validate succeeds with expected warnings', async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });

  await runCli(['export', '--workspace', fixture, '--out', outputRoot]);
  await runCli([
    'import',
    outputRoot,
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
  ]);
  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.failed.length, 0);
  assert.ok(
    report.warnings.some((warning: string) => warning.includes('Skills are manifest-only')),
  );
  assert.ok(report.nextSteps.some((step: string) => step.includes('Channel bindings')));
  assert.equal(
    existsSync(path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json')),
    true,
  );
});
