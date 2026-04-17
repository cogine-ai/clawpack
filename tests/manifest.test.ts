import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { extractAgentDefinition } from '../src/core/agent-extract';
import { checksumText } from '../src/core/checksums';
import { buildSkillsCompatibility } from '../src/core/compatibility';
import { buildExportArtifacts, buildExportReport, buildManifest } from '../src/core/manifest';
import { detectSkills } from '../src/core/skills-detect';
import type {
  AgentDefinition,
  RuntimeScanResult,
  SkillsManifest,
  WorkspaceScanResult,
} from '../src/core/types';
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
  assert.equal(manifest.includes.skills, 'topology-snapshot');
  assert.equal(manifest.includes.dailyMemory, false);
  assert.deepEqual(manifest.includes.workspaceFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'notes.txt', 'SOUL.md', 'TOOLS.md', 'USER.md']);
  assert.deepEqual(manifest.includes.bootstrapFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md']);
  assert.equal('bindings' in manifest.includes, false);
  assert.equal('cronJobs' in manifest.includes, false);
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
  mode: 'topology-snapshot',
  roots: [],
  allowlist: {
    mode: 'unrestricted',
    values: [],
    source: 'none',
    portability: 'host-bound',
    notes: [],
  },
  entries: [],
  effectiveSkills: [],
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

test('buildManifest and buildExportReport include compatibility labels', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const runtimeScan: RuntimeScanResult = {
    mode: 'full',
    agentDir: '/tmp/agent-dir',
    includedFiles: [
      { relativePath: 'models.json', absolutePath: '/tmp/agent-dir/models.json' },
      { relativePath: 'settings.json', absolutePath: '/tmp/agent-dir/settings.json' },
    ],
    excludedFiles: [{ relativePath: 'skills/demo/SKILL.md', reason: 'Excluded: unsupported runtime artifact' }],
    artifacts: {
      grounded: ['models.json'],
      inferred: ['settings.json'],
      unsupported: ['skills/demo/SKILL.md'],
    },
    warnings: [],
    sanitizedModels: { models: [{ id: 'gpt-5' }] },
    settingsAnalysis: undefined,
  };

  const manifest = buildManifest({
    packageName: 'compatibility-package',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
    warnings: [
      'Sentinel manual compatibility warning from buildManifest warnings.',
    ],
    runtimeScan,
  });
  const report = buildExportReport({
    packageName: 'compatibility-package',
    workspacePath: fixture,
    scan,
    skills,
    warnings: [
      'Channel bindings require manual reconfiguration on the target instance.',
      'Scheduled jobs require manual reconfiguration on the target instance.',
    ],
    runtimeManifest: {
      mode: runtimeScan.mode,
      agentDir: runtimeScan.agentDir,
      includedFiles: runtimeScan.includedFiles.map((file) => file.relativePath),
      excludedFiles: runtimeScan.excludedFiles,
      artifacts: runtimeScan.artifacts,
      warnings: runtimeScan.warnings,
      modelsSanitized: true,
      modelsSkipped: false,
      settingsAnalysisIncluded: false,
    },
  });

  assert.ok(Array.isArray(manifest.compatibility.labels));
  assert.ok(
    manifest.compatibility.labels.some((entry) =>
      entry.label === 'official' && entry.items?.includes('models.json')),
  );
  assert.ok(
    manifest.compatibility.labels.some((entry) =>
      entry.label === 'inferred' && entry.items?.includes('settings.json')),
  );
  assert.ok(
    manifest.compatibility.labels.some((entry) =>
      entry.label === 'unsupported' && entry.items?.includes('skills/demo/SKILL.md')),
  );
  assert.ok(
    manifest.compatibility.labels.some((entry) =>
      entry.label === 'manual' && entry.message.includes('Sentinel manual compatibility warning')),
  );

  assert.ok(Array.isArray(report.compatibility));
  assert.ok(
    report.compatibility.some((entry) =>
      entry.label === 'official' && entry.items?.includes('models.json')),
  );
  assert.ok(
    report.compatibility.some((entry) =>
      entry.label === 'manual' && entry.message.includes('Channel bindings require manual reconfiguration')),
  );
  assert.ok(
    report.compatibility.some((entry) =>
      entry.label === 'manual' && entry.message.includes('Scheduled jobs require manual reconfiguration')),
  );
  const labelOrder = ['official', 'inferred', 'manual', 'unsupported'];
  const manifestOrder = manifest.compatibility.labels.map((entry) => labelOrder.indexOf(entry.label));
  assert.deepEqual(manifestOrder, [...manifestOrder].sort((left, right) => left - right));
  const reportOrder = report.compatibility.map((entry) => labelOrder.indexOf(entry.label));
  assert.deepEqual(reportOrder, [...reportOrder].sort((left, right) => left - right));
});

test('buildSkillsCompatibility excludes freeform notes from compatibility items', () => {
  const compatibility = buildSkillsCompatibility({
    mode: 'topology-snapshot',
    roots: [],
    allowlist: {
      mode: 'unrestricted',
      values: [],
      source: 'none',
      portability: 'host-bound',
      notes: [],
    },
    entries: [],
    effectiveSkills: [
      {
        skillKey: 'brainstorming',
        status: 'visible',
        portability: 'portable',
        shadowed: [],
        notes: [],
      },
      {
        skillKey: 'review-and-ship',
        status: 'visible',
        portability: 'reinstall-required',
        shadowed: [],
        notes: [],
      },
    ],
    notes: ['Use the local skill registry for installation guidance.'],
  });

  const expectedItems = ['review-and-ship'];
  assert.deepEqual(
    compatibility.map((entry) => entry.items),
    [expectedItems, expectedItems],
  );
  assert.ok(
    compatibility.every((entry) =>
      entry.items?.every((item) => item !== 'Use the local skill registry for installation guidance.')),
  );
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
