const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdir, writeFile, rm } = require('node:fs/promises');
const { scanWorkspace } = require('../dist/core/workspace-scan.js');
const { detectSkills } = require('../dist/core/skills-detect.js');

const fixture = path.resolve('tests/fixtures/source-workspace');
const tempWorkspace = path.resolve('tests/tmp/skills-workspace');

test('detectSkills returns manifest-only with referenced skills from markdown', async () => {
  const scan = await scanWorkspace(fixture);
  const result = await detectSkills(scan);
  assert.equal(result.mode, 'manifest-only');
  assert.deepEqual(result.workspaceSkills, []);
  assert.deepEqual(result.referencedSkills, ['brainstorming', 'github']);
});

test('detectSkills notes workspace-local skills directory presence', async () => {
  await rm(tempWorkspace, { recursive: true, force: true });
  await mkdir(path.join(tempWorkspace, 'skills', 'demo-skill'), { recursive: true });
  await Promise.all([
    writeFile(path.join(tempWorkspace, 'AGENTS.md'), '# AGENTS\n', 'utf8'),
    writeFile(path.join(tempWorkspace, 'SOUL.md'), '# SOUL\n', 'utf8'),
    writeFile(path.join(tempWorkspace, 'IDENTITY.md'), '# IDENTITY\n', 'utf8'),
    writeFile(path.join(tempWorkspace, 'USER.md'), '# USER\n', 'utf8'),
    writeFile(path.join(tempWorkspace, 'TOOLS.md'), '# TOOLS\n', 'utf8'),
    writeFile(path.join(tempWorkspace, 'MEMORY.md'), '# MEMORY\n', 'utf8'),
  ]);

  const scan = await scanWorkspace(tempWorkspace);
  const result = await detectSkills(scan);
  assert.deepEqual(result.workspaceSkills, ['skills/']);
});
