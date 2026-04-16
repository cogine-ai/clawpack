import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUNTIME_GROUNDED_ARTIFACTS,
  RUNTIME_INFERRED_ARTIFACTS,
  RUNTIME_UNSUPPORTED_ARTIFACTS,
  RUNTIME_ALWAYS_EXCLUDE,
  RUNTIME_EXCLUDE_EXTENSIONS,
} from '../src/core/constants';

test('RUNTIME_GROUNDED_ARTIFACTS includes only source-backed runtime files', () => {
  assert.ok(RUNTIME_GROUNDED_ARTIFACTS.some((p) => p === 'models.json'));
  assert.equal(RUNTIME_GROUNDED_ARTIFACTS.includes('settings.json'), false);
  assert.equal(RUNTIME_GROUNDED_ARTIFACTS.includes('AGENTS.md'), false);
});

test('RUNTIME_INFERRED_ARTIFACTS contains convenience-only runtime files', () => {
  assert.ok(RUNTIME_INFERRED_ARTIFACTS.some((p) => p === 'settings.json'));
  assert.ok(RUNTIME_INFERRED_ARTIFACTS.some((p) => p === 'prompts/**'));
  assert.ok(RUNTIME_INFERRED_ARTIFACTS.some((p) => p === 'themes/**'));
});

test('RUNTIME_UNSUPPORTED_ARTIFACTS contains non-portable capability directories', () => {
  assert.ok(RUNTIME_UNSUPPORTED_ARTIFACTS.some((p) => p === 'skills/**'));
  assert.ok(RUNTIME_UNSUPPORTED_ARTIFACTS.some((p) => p === 'extensions/**'));
});

test('RUNTIME_ALWAYS_EXCLUDE includes auth and session files', () => {
  assert.ok(RUNTIME_ALWAYS_EXCLUDE.includes('auth-profiles.json'));
  assert.ok(RUNTIME_ALWAYS_EXCLUDE.includes('auth.json'));
  assert.ok(RUNTIME_ALWAYS_EXCLUDE.includes('sessions/**'));
  assert.ok(RUNTIME_ALWAYS_EXCLUDE.includes('node_modules/**'));
  assert.ok(RUNTIME_ALWAYS_EXCLUDE.includes('.git/**'));
});

test('RUNTIME_EXCLUDE_EXTENSIONS includes cache and temp file extensions', () => {
  assert.ok(RUNTIME_EXCLUDE_EXTENSIONS.includes('.log'));
  assert.ok(RUNTIME_EXCLUDE_EXTENSIONS.includes('.lock'));
  assert.ok(RUNTIME_EXCLUDE_EXTENSIONS.includes('.tmp'));
});
