const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { scanWorkspace } = require('../dist/core/workspace-scan.js');

const fixture = path.resolve('tests/fixtures/source-workspace');

test('scanWorkspace includes core files and excludes daily memory by default', async () => {
  const result = await scanWorkspace(fixture);
  assert.deepEqual(
    result.includedFiles.map((file) => file.relativePath),
    ['AGENTS.md', 'IDENTITY.md', 'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'USER.md'],
  );
  assert.deepEqual(result.missingOptionalFiles, ['HEARTBEAT.md']);
  assert.deepEqual(result.excludedFiles.map((file) => file.relativePath), ['memory/2026-03-16.md']);
  assert.ok(result.ignoredFiles.includes('notes.txt'));
});
