const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { scanWorkspace } = require('../dist/core/workspace-scan.js');
const { detectSkills } = require('../dist/core/skills-detect.js');
const { extractAgentDefinition } = require('../dist/core/agent-extract.js');
const { checksumText } = require('../dist/core/checksums.js');
const { buildManifest, buildExportReport } = require('../dist/core/manifest.js');

const fixture = path.resolve('tests/fixtures/source-workspace');

test('manifest builder emits required fields and manifest-only skills mode', async () => {
  const scan = await scanWorkspace(fixture);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(fixture);
  const manifest = buildManifest({
    packageName: 'fixture-package',
    workspacePath: fixture,
    scan,
    skills,
    agentDefinition,
  });

  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.packageType, 'openclaw-agent-template');
  assert.equal(manifest.includes.skills, 'manifest-only');
  assert.equal(manifest.includes.dailyMemory, false);
  assert.deepEqual(manifest.includes.workspaceFiles, ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md']);
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
