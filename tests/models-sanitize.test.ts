import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeModelsJson } from '../src/core/models-sanitize';

test('sanitizeModelsJson strips apiKey from model entries', () => {
  const input = {
    models: [
      { id: 'gpt-4', provider: 'openai', apiKey: 'sk-secret123' },
      { id: 'claude-3', provider: 'anthropic', apiKey: 'sk-ant-xxx' },
    ],
  };
  const result = sanitizeModelsJson(input);
  assert.ok(result.sanitized);
  for (const model of (result.sanitized as any).models) {
    assert.equal(model.apiKey, undefined);
  }
});

test('sanitizeModelsJson strips secret-like headers', () => {
  const input = {
    models: [
      {
        id: 'custom',
        headers: {
          Authorization: 'Bearer sk-xxx',
          'x-api-key': 'secret',
          'Content-Type': 'application/json',
        },
      },
    ],
  };
  const result = sanitizeModelsJson(input);
  const model = (result.sanitized as any).models[0];
  assert.equal(model.headers.Authorization, undefined);
  assert.equal(model.headers['x-api-key'], undefined);
  assert.equal(model.headers['Content-Type'], 'application/json');
});

test('sanitizeModelsJson strips SecretRef objects', () => {
  const input = {
    models: [
      {
        id: 'gpt-4',
        apiKey: { $secretRef: 'OPENAI_KEY', resolved: false },
      },
    ],
  };
  const result = sanitizeModelsJson(input);
  const model = (result.sanitized as any).models[0];
  assert.equal(model.apiKey, undefined);
});

test('sanitizeModelsJson preserves non-secret model structure', () => {
  const input = {
    models: [
      { id: 'gpt-4', provider: 'openai', maxTokens: 4096, temperature: 0.7 },
    ],
  };
  const result = sanitizeModelsJson(input);
  const model = (result.sanitized as any).models[0];
  assert.equal(model.id, 'gpt-4');
  assert.equal(model.provider, 'openai');
  assert.equal(model.maxTokens, 4096);
  assert.equal(model.temperature, 0.7);
});

test('sanitizeModelsJson returns undefined when nothing useful remains', () => {
  const input = {
    models: [
      { apiKey: 'sk-xxx' },
    ],
  };
  const result = sanitizeModelsJson(input);
  assert.equal(result.sanitized, undefined);
  assert.ok(result.warnings.length > 0);
});

test('sanitizeModelsJson handles empty object', () => {
  const result = sanitizeModelsJson({});
  assert.equal(result.sanitized, undefined);
  assert.ok(result.warnings.length > 0);
});

test('sanitizeModelsJson reports warnings for stripped fields', () => {
  const input = {
    models: [
      { id: 'gpt-4', apiKey: 'sk-xxx', secret: 'hidden' },
    ],
  };
  const result = sanitizeModelsJson(input);
  assert.ok(result.warnings.some(w => w.includes('apiKey') || w.includes('secret')));
});
