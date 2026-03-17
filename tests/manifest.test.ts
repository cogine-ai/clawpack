import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { extractAgentDefinition } from '../src/core/agent-extract';
import { checksumText } from '../src/core/checksums';
import { buildExportReport, buildManifest } from '../src/core/manifest';
import { detectSkills } from '../src/core/skills-detect';
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

  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.packageType, 'openclaw-agent-template');
  assert.equal(manifest.source.openclawVersion, '1.2.3');
  assert.equal(manifest.includes.skills, 'manifest-only');
  assert.equal(manifest.includes.dailyMemory, false);
  assert.deepEqual(manifest.includes.workspaceFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md']);
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
