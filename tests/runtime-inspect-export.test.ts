import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createTempWorkspace } from './helpers/workspace-factory';
import { runCli } from './helpers/run-cli';

const tmpBase = path.resolve('tests/tmp/runtime-cli');

test('inspect --runtime-mode default shows runtime section in human output', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws'));
  const agentDir = path.join(tmpBase, 'inspect-agentdir');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'models.json'), '{"models":[{"id":"gpt-5","apiKey":"sk-xxx"}]}', 'utf8');
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');

  const configPath = path.join(tmpBase, 'inspect-config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const { stdout } = await runCli([
    'inspect',
    '--workspace', wsPath,
    '--config', configPath,
    '--runtime-mode', 'default',
  ]);
  assert.match(stdout, /Runtime mode: default/);
  assert.match(stdout, /Compatibility labels:/i);
  assert.match(stdout, /official:/i);
  assert.match(stdout, /models\.json/);
  assert.match(stdout, /inferred:/i);
  assert.match(stdout, /settings\.json/);
  assert.match(stdout, /manual:/i);
  assert.match(stdout, /unsupported:/i);
  assert.doesNotMatch(stdout, /Runtime grounded files .*AGENTS\.md/i);
});

test('inspect --runtime-mode default --json includes runtime data', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-json'));
  const agentDir = path.join(tmpBase, 'inspect-agentdir-json');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'models.json'), '{"models":[{"id":"gpt-5","apiKey":"sk-xxx"}]}', 'utf8');
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');

  const configPath = path.join(tmpBase, 'inspect-config-json.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const { stdout } = await runCli([
    'inspect',
    '--workspace', wsPath,
    '--config', configPath,
    '--runtime-mode', 'DEFAULT',
    '--json',
  ]);
  const report = JSON.parse(stdout);
  assert.equal(report.runtime.mode, 'default');
  assert.ok(Array.isArray(report.runtime.includedFiles));
  assert.ok(Array.isArray(report.runtime.artifacts.grounded));
  assert.ok(report.runtime.artifacts.inferred.includes('settings.json'));
  assert.ok(Array.isArray(report.compatibility));
  assert.ok(
    report.compatibility.some((entry: { label: string; items?: string[] }) =>
      entry.label === 'official' && entry.items?.includes('models.json')),
  );
  assert.ok(
    report.compatibility.some((entry: { label: string; items?: string[] }) =>
      entry.label === 'inferred' && entry.items?.includes('settings.json')),
  );
  assert.ok(
    report.compatibility.some((entry: { label: string }) => entry.label === 'manual'),
  );
});

test('inspect without --runtime-mode defaults to resolved runtime mode output', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-none'));
  const { stdout } = await runCli(['inspect', '--workspace', wsPath]);
  assert.match(stdout, /Runtime mode: default/);
});

test('inspect without resolved agentDir still prints resolved runtime mode', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-no-agentdir-mode'));
  const { stdout } = await runCli([
    'inspect',
    '--workspace', wsPath,
    '--runtime-mode', 'default',
  ]);
  assert.match(stdout, /Runtime mode: default/);
  assert.match(stdout, /[Cc]ould not resolve|agentDir/);
});

test('inspect --runtime-mode default warns when agentDir unresolvable', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-noad'));
  const { stdout } = await runCli([
    'inspect',
    '--workspace', wsPath,
    '--runtime-mode', 'default',
  ]);
  assert.match(stdout, /[Cc]ould not resolve|agentDir/);
});

test('export --runtime-mode default writes only grounded runtime files in package', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws'));
  const agentDir = path.join(tmpBase, 'export-agentdir');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'models.json'), '{"models":[{"id":"gpt-5","apiKey":"sk-xxx"}]}', 'utf8');
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');
  await mkdir(path.join(agentDir, 'prompts'), { recursive: true });
  await writeFile(path.join(agentDir, 'prompts', 'system.md'), '# System', 'utf8');

  const configPath = path.join(tmpBase, 'export-config.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const outputPath = path.join(tmpBase, 'export-output.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--config', configPath,
    '--runtime-mode', 'default',
  ]);

  assert.match(stdout, /Export complete/);
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'manifest.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'models.json')));
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'settings.json')), false);
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'prompts', 'system.md')), false);
});

test('export --runtime-mode none does not write runtime subtree', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-none'));

  const outputPath = path.join(tmpBase, 'export-output-none.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--runtime-mode', 'none',
  ]);

  assert.equal(existsSync(path.join(outputPath, 'runtime')), false);
});

test('export --runtime-mode default --json includes runtime in report', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-json'));
  const agentDir = path.join(tmpBase, 'export-agentdir-json');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'models.json'), '{"models":[{"id":"gpt-5","apiKey":"sk-xxx"}]}', 'utf8');
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');

  const configPath = path.join(tmpBase, 'export-config-json.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const outputPath = path.join(tmpBase, 'export-output-json.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--config', configPath,
    '--runtime-mode', 'default',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.status, 'ok');
  assert.equal(report.runtimeMode, 'default');
  assert.ok(report.runtimeGroundedFiles.includes('models.json'));
  assert.ok(report.runtimeInferredFiles.includes('settings.json'));
  assert.ok(Array.isArray(report.compatibility));
  assert.ok(
    report.compatibility.some((entry: { label: string; items?: string[] }) =>
      entry.label === 'official' && entry.items?.includes('models.json')),
  );
  assert.ok(
    report.compatibility.some((entry: { label: string; items?: string[] }) =>
      entry.label === 'inferred' && entry.items?.includes('settings.json')),
  );
  assert.ok(
    report.compatibility.some((entry: { label: string }) => entry.label === 'manual'),
  );
});

test('export --archive --json reports an existing manifestPath', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-archive-json'));
  const outputPath = path.join(tmpBase, 'export-output-archive-json.ocpkg');
  const archivePath = `${outputPath}.tar.gz`;
  await rm(outputPath, { recursive: true, force: true });
  await rm(archivePath, { recursive: true, force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--archive',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.packageRoot, archivePath);
  assert.equal(report.manifestPath, archivePath);
  assert.equal(existsSync(report.manifestPath), true);
});

test('export --runtime-mode full includes inferred files but still excludes unsupported skills and extensions', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-full'));
  const agentDir = path.join(tmpBase, 'export-agentdir-full');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'models.json'), '{"models":[{"id":"gpt-5","apiKey":"sk-xxx"}]}', 'utf8');
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');
  await mkdir(path.join(agentDir, 'prompts'), { recursive: true });
  await writeFile(path.join(agentDir, 'prompts', 'system.md'), '# System', 'utf8');
  await mkdir(path.join(agentDir, 'skills', 'my-skill'), { recursive: true });
  await writeFile(path.join(agentDir, 'skills', 'my-skill', 'SKILL.md'), '# My Skill', 'utf8');
  await mkdir(path.join(agentDir, 'extensions', 'ext1'), { recursive: true });
  await writeFile(path.join(agentDir, 'extensions', 'ext1', 'package.json'), '{}', 'utf8');

  const configPath = path.join(tmpBase, 'export-config-full.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const outputPath = path.join(tmpBase, 'export-output-full.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--config', configPath,
    '--runtime-mode', 'full',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.status, 'ok');
  assert.equal(report.runtimeMode, 'full');
  assert.ok(report.runtimeFiles.includes('settings.json'));
  assert.ok(report.runtimeFiles.includes('prompts/system.md'));
  assert.ok(!report.runtimeFiles.some((f: string) => f.includes('skills/')));
  assert.ok(!report.runtimeFiles.some((f: string) => f.includes('extensions/')));
  assert.ok(report.runtimeUnsupportedFiles.includes('skills/my-skill/SKILL.md'));
  assert.ok(report.runtimeUnsupportedFiles.includes('extensions/ext1/package.json'));

  assert.ok(existsSync(path.join(outputPath, 'runtime', 'manifest.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'settings.json')));
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'prompts', 'system.md')));
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'skills', 'my-skill', 'SKILL.md')), false);
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'extensions', 'ext1', 'package.json')), false);
});

test('export --runtime-mode default excludes skills and extensions', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-default-no-skills'));
  const agentDir = path.join(tmpBase, 'export-agentdir-default-no-skills');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');
  await mkdir(path.join(agentDir, 'skills', 'my-skill'), { recursive: true });
  await writeFile(path.join(agentDir, 'skills', 'my-skill', 'SKILL.md'), '# My Skill', 'utf8');
  await mkdir(path.join(agentDir, 'extensions', 'my-ext'), { recursive: true });
  await writeFile(path.join(agentDir, 'extensions', 'my-ext', 'EXTENSION.md'), '# My Extension', 'utf8');

  const configPath = path.join(tmpBase, 'export-config-default-no-skills.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir: agentDir,
      },
    }),
    'utf8',
  );

  const outputPath = path.join(tmpBase, 'export-output-default-no-skills.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  const { stdout } = await runCli([
    'export',
    '--workspace', wsPath,
    '--out', outputPath,
    '--config', configPath,
    '--runtime-mode', 'default',
    '--json',
  ]);

  const report = JSON.parse(stdout);
  assert.equal(report.runtimeMode, 'default');
  assert.ok(!report.runtimeFiles?.some((f: string) => f.includes('skills/')));
  assert.ok(!report.runtimeFiles?.some((f: string) => f.includes('extensions/')));
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'skills')), false);
  assert.equal(existsSync(path.join(outputPath, 'runtime', 'files', 'extensions')), false);
});

test('export --runtime-mode default errors when agentDir unresolvable', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-block'));
  const outputPath = path.join(tmpBase, 'export-output-block.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  try {
    await runCli([
      'export',
      '--workspace', wsPath,
      '--out', outputPath,
      '--runtime-mode', 'default',
    ]);
    assert.fail('Expected export to fail when agentDir is unresolvable');
  } catch (err: any) {
    assert.ok(
      err.stderr?.includes('agentDir') || err.message?.includes('agentDir'),
      'Error should mention agentDir',
    );
  }
});

test('export rejects invalid --runtime-mode values', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws-invalid-mode'));
  const agentDir = path.join(tmpBase, 'export-agentdir-invalid-mode');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
  await writeFile(path.join(agentDir, 'settings.json'), '{}', 'utf8');

  const configPath = path.join(tmpBase, 'export-config-invalid-mode.json');
  await writeFile(
    configPath,
    JSON.stringify({
      agent: {
        id: 'test-agent',
        name: 'Test',
        workspace: wsPath,
        agentDir,
      },
    }),
    'utf8',
  );

  const outputPath = path.join(tmpBase, 'export-output-invalid-mode.ocpkg');
  await rm(outputPath, { recursive: true, force: true });

  try {
    await runCli([
      'export',
      '--workspace', wsPath,
      '--out', outputPath,
      '--config', configPath,
      '--runtime-mode', 'sideways',
    ]);
    assert.fail('Expected export to fail for invalid runtime mode');
  } catch (err: any) {
    assert.match(err.stderr ?? err.message ?? '', /runtime-mode/i);
    assert.match(err.stderr ?? err.message ?? '', /none|default|full/);
  }
});
