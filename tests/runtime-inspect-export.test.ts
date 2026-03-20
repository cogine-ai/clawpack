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
  assert.match(stdout, /settings\.json/);
});

test('inspect --runtime-mode default --json includes runtime data', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-json'));
  const agentDir = path.join(tmpBase, 'inspect-agentdir-json');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
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
    '--runtime-mode', 'default',
    '--json',
  ]);
  const report = JSON.parse(stdout);
  assert.equal(report.runtime.mode, 'default');
  assert.ok(Array.isArray(report.runtime.includedFiles));
});

test('inspect without --runtime-mode does not show runtime section', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'inspect-ws-none'));
  const { stdout } = await runCli(['inspect', '--workspace', wsPath]);
  assert.ok(!stdout.includes('Runtime mode:'));
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

test('export --runtime-mode default writes runtime subtree in package', async () => {
  const wsPath = await createTempWorkspace(path.join(tmpBase, 'export-ws'));
  const agentDir = path.join(tmpBase, 'export-agentdir');
  await rm(agentDir, { recursive: true, force: true });
  await mkdir(agentDir, { recursive: true });
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
  assert.ok(existsSync(path.join(outputPath, 'runtime', 'files', 'settings.json')));
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
