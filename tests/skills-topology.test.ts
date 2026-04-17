import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { detectSkills } from '../src/core/skills-detect';
import { scanWorkspace } from '../src/core/workspace-scan';
import { runCli } from './helpers/run-cli';
import { createTempWorkspace, cleanupTempWorkspace } from './helpers/workspace-factory';

const tmpRoot = path.resolve('tests/tmp/skills-topology');

async function writeSkill(
  rootPath: string,
  relativeSkillDir: string,
  options: {
    body?: string;
    skillKey?: string;
  } = {},
) {
  const skillDir = path.join(rootPath, relativeSkillDir);
  await mkdir(skillDir, { recursive: true });

  const frontmatter = options.skillKey
    ? [
        '---',
        'metadata:',
        '  openclaw:',
        `    skillKey: ${options.skillKey}`,
        '---',
        '',
      ].join('\n')
    : '';

  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `${frontmatter}${options.body ?? '# Skill\n'}\n`,
    'utf8',
  );
}

async function setupSkillTopologyFixture(basePath: string) {
  const workspacePath = path.join(basePath, 'workspace-writer');
  const homePath = path.join(basePath, 'fake-home');
  const stateDir = path.join(homePath, '.openclaw');
  const extraDir = path.join(basePath, 'shared-skills');
  const pluginRoot = path.join(basePath, 'voice-plugin');
  const configPath = path.join(stateDir, 'openclaw.json');

  await cleanupTempWorkspace(basePath);
  await createTempWorkspace(workspacePath, {
    files: {
      'AGENTS.md': '# AGENTS\n',
      'SOUL.md': '# SOUL\n',
    },
  });

  await writeSkill(workspacePath, 'skills/github');
  await writeSkill(workspacePath, '.agents/skills/review');
  await writeSkill(homePath, '.agents/skills/review');
  await writeSkill(stateDir, 'skills/weather');
  await writeSkill(extraDir, 'docs-search');
  await writeSkill(extraDir, 'disabled-shared');

  await mkdir(pluginRoot, { recursive: true });
  await writeFile(
    path.join(pluginRoot, 'openclaw.plugin.json'),
    JSON.stringify({
      id: 'voice-tools',
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {},
      },
      skills: ['skills'],
    }),
    'utf8',
  );
  await writeSkill(path.join(pluginRoot, 'skills'), 'voice-helper', {
    skillKey: 'voice-assist',
  });

  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        skills: {
          allowBundled: ['peekaboo'],
          load: {
            extraDirs: [extraDir],
          },
          entries: {
            weather: {
              enabled: true,
              env: {
                WEATHER_API_KEY: 'top-secret',
              },
            },
            'disabled-shared': {
              enabled: false,
            },
          },
        },
        plugins: {
          enabled: true,
          load: {
            paths: [pluginRoot],
          },
          entries: {
            'voice-tools': {
              enabled: true,
            },
          },
        },
        agents: {
          defaults: {
            skills: ['github', 'peekaboo', 'review', 'weather', 'voice-assist'],
          },
          list: [
            { id: 'writer', workspace: workspacePath },
            { id: 'docs', workspace: path.join(basePath, 'workspace-docs'), skills: ['docs-search'] },
          ],
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  return { workspacePath, homePath, stateDir, extraDir, pluginRoot, configPath };
}

test('detectSkills snapshots roots, precedence, allowlists, and portability', async () => {
  const fixture = await setupSkillTopologyFixture(tmpRoot);
  try {
    const scan = await scanWorkspace(fixture.workspacePath);
    const result = await detectSkills(scan, {
      configPath: fixture.configPath,
      agentId: 'writer',
      homePath: fixture.homePath,
    });

    assert.equal(result.mode, 'topology-snapshot');
    assert.equal(result.allowlist.mode, 'allowlist');
    assert.deepEqual(result.allowlist.values, ['github', 'peekaboo', 'review', 'voice-assist', 'weather']);

    assert.deepEqual(
      result.roots.map((root) => root.kind),
      [
        'workspace',
        'project-agent',
        'personal-agent',
        'managed',
        'bundled',
        'extra-dir',
        'plugin-provided',
      ],
    );

    const review = result.effectiveSkills.find((skill) => skill.skillKey === 'review');
    assert.ok(review);
    assert.equal(review.status, 'visible');
    assert.equal(review.portability, 'portable');
    assert.equal(review.source?.rootKind, 'project-agent');
    assert.deepEqual(review.shadowed.map((entry) => entry.rootKind), ['personal-agent']);

    const github = result.effectiveSkills.find((skill) => skill.skillKey === 'github');
    assert.ok(github);
    assert.equal(github.status, 'visible');
    assert.equal(github.source?.rootKind, 'workspace');
    assert.equal(github.portability, 'portable');

    const weather = result.effectiveSkills.find((skill) => skill.skillKey === 'weather');
    assert.ok(weather);
    assert.equal(weather.status, 'visible');
    assert.equal(weather.source?.rootKind, 'managed');
    assert.equal(weather.portability, 'reinstall-required');
    assert.ok(weather.notes.some((note) => note.includes('WEATHER_API_KEY')));

    const peekaboo = result.effectiveSkills.find((skill) => skill.skillKey === 'peekaboo');
    assert.ok(peekaboo);
    assert.equal(peekaboo.status, 'visible');
    assert.equal(peekaboo.source?.rootKind, 'bundled');
    assert.equal(peekaboo.portability, 'reinstall-required');

    const voiceAssist = result.effectiveSkills.find((skill) => skill.skillKey === 'voice-assist');
    assert.ok(voiceAssist);
    assert.equal(voiceAssist.status, 'visible');
    assert.equal(voiceAssist.source?.rootKind, 'plugin-provided');
    assert.equal(voiceAssist.portability, 'reinstall-required');

    const disabledShared = result.effectiveSkills.find((skill) => skill.skillKey === 'disabled-shared');
    assert.ok(disabledShared);
    assert.equal(disabledShared.status, 'disabled');
    assert.equal(disabledShared.portability, 'unsupported');
  } finally {
    await cleanupTempWorkspace(tmpRoot);
  }
});

test('detectSkills applies explicit per-agent skill allowlists instead of inheriting defaults', async () => {
  const fixture = await setupSkillTopologyFixture(tmpRoot);
  try {
    const scan = await scanWorkspace(fixture.workspacePath);
    const result = await detectSkills(scan, {
      configPath: fixture.configPath,
      agentId: 'docs',
      homePath: fixture.homePath,
    });

    assert.equal(result.allowlist.mode, 'allowlist');
    assert.deepEqual(result.allowlist.values, ['docs-search']);

    const docsSearch = result.effectiveSkills.find((skill) => skill.skillKey === 'docs-search');
    assert.ok(docsSearch);
    assert.equal(docsSearch.status, 'visible');

    const github = result.effectiveSkills.find((skill) => skill.skillKey === 'github');
    assert.ok(github);
    assert.equal(github.status, 'filtered-out');
    assert.equal(github.portability, 'unsupported');
  } finally {
    await cleanupTempWorkspace(tmpRoot);
  }
});

test('inspect and export surface the topology snapshot in JSON output', async () => {
  const fixture = await setupSkillTopologyFixture(tmpRoot);
  try {
    const env = {
      HOME: fixture.homePath,
      OPENCLAW_CONFIG_PATH: fixture.configPath,
    };

    const inspectResult = await runCli(
      ['inspect', '--workspace', fixture.workspacePath, '--agent-id', 'writer', '--json'],
      { env },
    );
    const inspectReport = JSON.parse(inspectResult.stdout);
    assert.equal(inspectReport.skills.mode, 'topology-snapshot');
    assert.equal(inspectReport.skills.allowlist.mode, 'allowlist');
    assert.ok(
      inspectReport.skills.effectiveSkills.some(
        (skill: { skillKey: string; status: string }) =>
          skill.skillKey === 'voice-assist' && skill.status === 'visible',
      ),
    );

    const exportPath = path.join(tmpRoot, 'pkg.ocpkg');
    const exportResult = await runCli(
      [
        'export',
        '--workspace',
        fixture.workspacePath,
        '--agent-id',
        'writer',
        '--out',
        exportPath,
        '--json',
      ],
      { env },
    );
    const exportReport = JSON.parse(exportResult.stdout);
    assert.equal(exportReport.skills.mode, 'topology-snapshot');
    assert.equal(exportReport.skills.allowlist.mode, 'allowlist');
    assert.ok(Array.isArray(exportReport.skills.roots));
  } finally {
    await cleanupTempWorkspace(tmpRoot);
  }
});

test('inspect and export honor explicit agentId when multiple agents share one workspace', async () => {
  const fixture = await setupSkillTopologyFixture(tmpRoot);
  const multiAgentConfigPath = path.join(tmpRoot, 'multi-agent-config.json');

  try {
    await writeFile(
      multiAgentConfigPath,
      JSON.stringify(
        {
          agents: {
            list: [
              {
                id: 'writer-default',
                default: true,
                workspace: fixture.workspacePath,
                skills: ['github'],
              },
              {
                id: 'writer-docs',
                workspace: fixture.workspacePath,
                skills: ['docs-search'],
              },
            ],
          },
          skills: {
            load: {
              extraDirs: [fixture.extraDir],
            },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const inspectResult = await runCli(
      [
        'inspect',
        '--workspace',
        fixture.workspacePath,
        '--config',
        multiAgentConfigPath,
        '--agent-id',
        'writer-docs',
        '--json',
      ],
      { env: { HOME: fixture.homePath } },
    );
    const inspectReport = JSON.parse(inspectResult.stdout);
    assert.deepEqual(inspectReport.skills.allowlist.values, ['docs-search']);

    const exportPath = path.join(tmpRoot, 'pkg-multi.ocpkg');
    const exportResult = await runCli(
      [
        'export',
        '--workspace',
        fixture.workspacePath,
        '--config',
        multiAgentConfigPath,
        '--agent-id',
        'writer-docs',
        '--out',
        exportPath,
        '--json',
      ],
      { env: { HOME: fixture.homePath } },
    );
    const exportReport = JSON.parse(exportResult.stdout);
    assert.deepEqual(exportReport.skills.allowlist.values, ['docs-search']);
  } finally {
    await cleanupTempWorkspace(tmpRoot);
  }
});

test('detectSkills expands tilde OPENCLAW_STATE_DIR for managed roots', async () => {
  const fixture = await setupSkillTopologyFixture(tmpRoot);
  const originalHome = process.env.HOME;
  const originalStateDir = process.env.OPENCLAW_STATE_DIR;

  try {
    const tildeStateDir = path.join(fixture.homePath, '.tilde-openclaw');
    await writeSkill(tildeStateDir, 'skills/tilde-managed');

    process.env.HOME = fixture.homePath;
    process.env.OPENCLAW_STATE_DIR = '~/.tilde-openclaw';

    const scan = await scanWorkspace(fixture.workspacePath);
    const result = await detectSkills(scan, {
      homePath: fixture.homePath,
    });

    const managedRoot = result.roots.find((root) => root.kind === 'managed');
    assert.ok(managedRoot);
    assert.equal(managedRoot.path, path.join(fixture.homePath, '.tilde-openclaw', 'skills'));
    assert.ok(managedRoot.skillKeys.includes('tilde-managed'));
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }

    if (originalStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = originalStateDir;
    }

    await cleanupTempWorkspace(tmpRoot);
  }
});
