import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RUNTIME_ALLOWLIST_DEFAULT,
  RUNTIME_ALLOWLIST_FULL_EXTRA,
  RUNTIME_ALWAYS_EXCLUDE,
  RUNTIME_EXCLUDE_EXTENSIONS,
} from '../src/core/constants';

test('RUNTIME_ALLOWLIST_DEFAULT includes expected files', () => {
  assert.ok(RUNTIME_ALLOWLIST_DEFAULT.some((p) => p === 'AGENTS.md'));
  assert.ok(RUNTIME_ALLOWLIST_DEFAULT.some((p) => p === 'settings.json'));
  assert.ok(RUNTIME_ALLOWLIST_DEFAULT.some((p) => p === 'prompts/**'));
  assert.ok(RUNTIME_ALLOWLIST_DEFAULT.some((p) => p === 'themes/**'));
  assert.ok(RUNTIME_ALLOWLIST_DEFAULT.some((p) => p === 'models.json'));
});

test('RUNTIME_ALLOWLIST_FULL_EXTRA adds skills and extensions', () => {
  assert.ok(RUNTIME_ALLOWLIST_FULL_EXTRA.some((p) => p === 'skills/**'));
  assert.ok(RUNTIME_ALLOWLIST_FULL_EXTRA.some((p) => p === 'extensions/**'));
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
