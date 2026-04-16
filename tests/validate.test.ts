import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runCli } from './helpers/run-cli';

const fixture = path.resolve('tests/fixtures/source-workspace');
const packageRoot = path.resolve('tests/tmp/validate-fixture.ocpkg');
const targetRoot = path.resolve('tests/tmp/validate-target/workspace-supercoder-copy');

async function exportAndImport() {
  await rm(packageRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });

  await runCli(['export', '--workspace', fixture, '--out', packageRoot]);
  await runCli([
    'import',
    packageRoot,
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
  ]);
}

test('validate command defaults to human-readable output and supports --json', async () => {
  await exportAndImport();

  const human = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
  ]);
  assert.match(human.stdout, /Validation: passed/);
  assert.match(human.stdout, /Passed:/);
  assert.match(human.stdout, /Warnings:/);
  assert.match(human.stdout, /Next steps:/);
  assert.match(human.stdout, /Compatibility labels:/);
  assert.match(human.stdout, /manual:/i);
  assert.equal(human.stdout.includes('"passed"'), false);

  const json = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--json',
  ]);
  const report = JSON.parse(json.stdout);
  assert.ok(Array.isArray(report.passed));
  assert.ok(Array.isArray(report.failed));
  assert.ok(Array.isArray(report.compatibility));
});

test('validate command reports passed warnings failed and nextSteps', async () => {
  await exportAndImport();

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--json',
  ]);
  const report = JSON.parse(stdout);

  assert.equal(Array.isArray(report.passed), true);
  assert.equal(Array.isArray(report.warnings), true);
  assert.equal(Array.isArray(report.failed), true);
  assert.equal(Array.isArray(report.nextSteps), true);
  assert.equal(Array.isArray(report.compatibility), true);
  assert.equal(report.failed.length, 0);
  assert.ok(
    report.warnings.some((warning: string) => warning.includes('Skills are manifest-only')),
  );
  assert.ok(report.nextSteps.some((step: string) => step.includes('does not restore live bindings or scheduled jobs')));
  assert.ok(report.nextSteps.some((step: string) => step.includes('openclaw doctor')));
  assert.ok(
    report.compatibility.some((entry: { label: string }) => entry.label === 'manual'),
  );
  assert.ok(
    report.compatibility.some((entry: { label: string }) => entry.label === 'unsupported'),
  );
  assert.equal(
    existsSync(path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json')),
    true,
  );

  const record = JSON.parse(
    await readFile(
      path.join(targetRoot, '.openclaw-agent-package', 'agent-definition.json'),
      'utf8',
    ),
  );
  assert.equal(record.agentId, 'supercoder-copy');
});

test('validate reports target config consistency when config path is provided', async () => {
  await exportAndImport();
  const configRoot = path.resolve('tests/tmp/validate-config');
  const configPath = path.join(configRoot, 'openclaw-config.json');
  await rm(configRoot, { recursive: true, force: true });
  await rm(path.dirname(targetRoot), { recursive: true, force: true });
  await exportAndImport();

  await mkdir(configRoot, { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [
            {
              id: 'supercoder-copy',
              name: 'Supercoder',
              workspace: targetRoot,
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--config',
    configPath,
    '--json',
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.failed.length, 0);
  assert.ok(report.passed.some((entry: string) => entry.includes('OpenClaw config agent present')));
  assert.ok(report.passed.some((entry: string) => entry.includes('workspace matches')));

  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [
            {
              id: 'supercoder-copy',
              name: 'Supercoder',
              workspace: '/tmp/wrong-workspace',
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  const mismatch = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--config',
    configPath,
    '--json',
  ]);
  const mismatchReport = JSON.parse(mismatch.stdout);
  assert.ok(mismatchReport.failed.some((entry: string) => entry.includes('workspace mismatch')));
});

test('validate anchors relative config workspace paths to the config directory', async () => {
  await exportAndImport();
  const configRoot = path.resolve('tests/tmp/validate-relative-config');
  const configPath = path.join(configRoot, 'nested', 'openclaw-config.json');
  await rm(configRoot, { recursive: true, force: true });
  await mkdir(path.dirname(configPath), { recursive: true });

  const relativeWorkspace = path.relative(path.dirname(configPath), targetRoot);
  await writeFile(
    configPath,
    JSON.stringify(
      {
        agents: {
          list: [
            {
              id: 'supercoder-copy',
              name: 'Supercoder',
              workspace: relativeWorkspace,
            },
          ],
        },
      },
      null,
      2,
    ),
  );

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--config',
    configPath,
    '--json',
  ]);
  const report = JSON.parse(stdout);
  assert.equal(report.failed.some((entry: string) => entry.includes('workspace mismatch')), false);
  assert.ok(report.passed.some((entry: string) => entry.includes('workspace matches')));
});

test('validate reports missing required workspace files as failures', async () => {
  await exportAndImport();
  await rm(path.join(targetRoot, 'AGENTS.md'), { force: true });

  const { stdout } = await runCli([
    'validate',
    '--target-workspace',
    targetRoot,
    '--agent-id',
    'supercoder-copy',
    '--json',
  ]);
  const report = JSON.parse(stdout);

  assert.ok(report.failed.some((failure: string) => failure.includes('AGENTS.md')));
});
