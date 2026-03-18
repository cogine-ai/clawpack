import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { extractAgentDefinition } from '../src/core/agent-extract';
import { checksumText } from '../src/core/checksums';
import { buildExportArtifacts, buildExportReport, buildManifest } from '../src/core/manifest';
import { detectSkills } from '../src/core/skills-detect';
import type { AgentDefinition, SkillsManifest, WorkspaceScanResult } from '../src/core/types';
import { scanWorkspace } from '../src/core/workspace-scan';

const fixture = path.resolve('tests/fixtures/source-workspace');

test('manifest builder emits required fields and additive metadata', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const manifest = buildManifest({
    packageName: 'fixture-package',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
    openclawVersion: '1.2.3',
    metadata: {
      createdAt: '2026-03-18T00:00:00.000Z',
      createdBy: {
        name: '@cogineai/clawpacker',
        version: '9.9.9',
      },
      platform: {
        os: 'linux',
        arch: 'x64',
        node: 'v22.0.0',
      },
      contentHash: 'abc123',
    },
  });

  assert.equal(manifest.formatVersion, 2);
  assert.equal(manifest.packageType, 'openclaw-agent-template');
  assert.equal(manifest.source.openclawVersion, '1.2.3');
  assert.equal(manifest.includes.skills, 'manifest-only');
  assert.equal(manifest.includes.dailyMemory, false);
  assert.deepEqual(manifest.includes.workspaceFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'notes.txt', 'SOUL.md', 'TOOLS.md', 'USER.md']);
  assert.deepEqual(manifest.includes.bootstrapFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md']);
  assert.equal(manifest.includes.bindings, false);
  assert.equal(manifest.includes.cronJobs, false);
  assert.deepEqual(manifest.excludes, { secrets: true, sessionState: true, connectionState: true });
  assert.deepEqual(manifest.metadata, {
    createdAt: '2026-03-18T00:00:00.000Z',
    createdBy: {
      name: '@cogineai/clawpacker',
      version: '9.9.9',
    },
    platform: {
      os: 'linux',
      arch: 'x64',
      node: 'v22.0.0',
    },
    contentHash: 'abc123',
  });
});

test('checksums and export report are deterministic and include exclusions', async () => {
  const checksum = checksumText('hello\n');
  assert.equal(checksum.length, 64);

  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const report = buildExportReport({
    packageName: 'fixture-package',
    workspacePath: fixture,
    scan,
    skills,
    warnings: ['demo warning'],
  });

  assert.equal(report.warnings[0], 'demo warning');
  assert.deepEqual(report.excludedFiles.map((file) => file.relativePath), ['memory/2026-03-16.md']);
});

const emptyAgentDef: AgentDefinition = {
  agent: {
    suggestedId: 'empty',
    suggestedName: 'Empty',
    workspace: { suggestedBasename: 'workspace-empty' },
    identity: { name: 'Empty' },
  },
  fieldClassification: {},
  notes: [],
};

const emptySkills: SkillsManifest = {
  mode: 'manifest-only',
  workspaceSkills: [],
  referencedSkills: [],
  notes: [],
};

const emptyScan: WorkspaceScanResult = {
  workspacePath: '/nonexistent',
  includedFiles: [],
  excludedFiles: [],
};

test('buildManifest handles empty scan result', () => {
  const manifest = buildManifest({
    packageName: 'empty-package',
    workspacePath: '/nonexistent',
    scan: emptyScan,
    skills: emptySkills,
    agentDefinition: emptyAgentDef,
  });

  assert.deepEqual(manifest.includes.workspaceFiles, []);
  assert.equal(manifest.formatVersion, 2);
  assert.equal(manifest.source.openclawVersion, 'unknown');
});

test('buildManifest defaults openclawVersion to unknown when not provided', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const manifest = buildManifest({
    packageName: 'no-version',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
  });

  assert.equal(manifest.source.openclawVersion, 'unknown');
});

test('buildManifest auto-generates metadata when not explicitly provided', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const manifest = buildManifest({
    packageName: 'auto-meta',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
    checksums: { 'workspace/AGENTS.md': 'abc' },
  });

  assert.ok(manifest.metadata);
  assert.match(manifest.metadata.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(manifest.metadata.createdBy.name, '@cogineai/clawpacker');
  assert.equal(manifest.metadata.platform.os, process.platform);
  assert.equal(manifest.metadata.contentHash.length, 64);
});

test('buildExportArtifacts returns manifest, checksums, and exportReport', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const artifacts = buildExportArtifacts({
    packageName: 'artifacts-test',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
    checksums: { 'workspace/AGENTS.md': 'deadbeef' },
    warnings: ['test warning'],
  });

  assert.ok(artifacts.manifest);
  assert.ok(artifacts.checksums);
  assert.ok(artifacts.exportReport);
  assert.equal(artifacts.manifest.name, 'artifacts-test');
  assert.equal(artifacts.checksums['workspace/AGENTS.md'], 'deadbeef');
  assert.equal(artifacts.exportReport.warnings[0], 'test warning');
});
