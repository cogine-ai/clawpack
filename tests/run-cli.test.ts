import assert from 'node:assert/strict';
import test from 'node:test';

test('runCli exposes child-process guardrails for shared CLI tests', async () => {
  const module = await import('./helpers/run-cli');

  assert.ok(
    'runCliExecOptions' in module,
    'runCliExecOptions should be exported for test coverage',
  );
  assert.equal(module.runCliExecOptions.timeout, 30_000);
  assert.equal(module.runCliExecOptions.maxBuffer, 10 * 1024 * 1024);
});
