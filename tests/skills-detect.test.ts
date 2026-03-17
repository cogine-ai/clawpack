import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { detectSkills } from '../src/core/skills-detect';
import { scanWorkspace } from '../src/core/workspace-scan';

const fixture = path.resolve('tests/fixtures/source-workspace');
const tempWorkspace = path.resolve('tests/tmp/skills-workspace');

async function writeRequiredWorkspaceFiles(root: string, overrides: Partial<Record<string, string>> = {}) {
  const files: Record<string, string> = {
    'AGENTS.md': '# AGENTS\n',
    'SOUL.md': '# SOUL\n',
    'IDENTITY.md': '# IDENTITY\n',
    'USER.md': '# USER\n',
    'TOOLS.md': '# TOOLS\n',
    'MEMORY.md': '# MEMORY\n',
    ...overrides,
  };

  await Promise.all(
    Object.entries(files).map(([filename, content]) => writeFile(path.join(root, filename), content, 'utf8')),
  );
}

test('detectSkills returns manifest-only with referenced skills from markdown', async () => {
  const scan = await scanWorkspace(fixture);
  const result = await detectSkills(scan);
  assert.equal(result.mode, 'manifest-only');
  assert.deepEqual(result.workspaceSkills, []);
  assert.deepEqual(result.referencedSkills, ['brainstorming']);
});

test('detectSkills ignores natural-language verb phrases that do not explicitly reference a skill', async () => {
  await rm(tempWorkspace, { recursive: true, force: true });
  await mkdir(tempWorkspace, { recursive: true });
  await writeRequiredWorkspaceFiles(tempWorkspace, {
    'AGENTS.md': `# AGENTS
Use the database for state.
This requires node.
Install dependencies before running tests.
Using git for version control is fine.
Use the skill \`brainstorming\` before adding major features.
`,
    'SOUL.md': '# SOUL\nInvoke github when checking pull requests.\n',
  });

  const scan = await scanWorkspace(tempWorkspace);
  const result = await detectSkills(scan);
  assert.deepEqual(result.referencedSkills, ['brainstorming']);
});

test('detectSkills notes workspace-local skills directory presence', async () => {
  await rm(tempWorkspace, { recursive: true, force: true });
  await mkdir(path.join(tempWorkspace, 'skills', 'demo-skill'), { recursive: true });
  await writeRequiredWorkspaceFiles(tempWorkspace);

  const scan = await scanWorkspace(tempWorkspace);
  const result = await detectSkills(scan);
  assert.deepEqual(result.workspaceSkills, ['skills/']);
});
