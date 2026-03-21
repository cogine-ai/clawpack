import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPathRewrites, computePathRewrites } from '../src/core/path-rewrite';
import type { SettingsAnalysis } from '../src/core/types';

test('computePathRewrites rewrites workspace and agentDir paths', () => {
  const analysis: SettingsAnalysis = {
    pathRefs: [
      { key: 'wsRoot', value: '/home/alice/ws', classification: 'package-internal-workspace' },
      { key: 'adConf', value: '/home/alice/.oc/agent/config', classification: 'package-internal-agentDir' },
      { key: 'rel', value: './data', classification: 'relative' },
    ],
    summary: { total: 3, packageInternalWorkspace: 1, packageInternalAgentDir: 1, relative: 1, externalAbsolute: 0, hostBound: 0 },
  };

  const result = computePathRewrites({
    settingsAnalysis: analysis,
    sourceWorkspacePath: '/home/alice/ws',
    sourceAgentDir: '/home/alice/.oc/agent',
    targetWorkspacePath: '/target/ws',
    targetAgentDir: '/target/agent',
  });

  assert.equal(result.rewrites.length, 2);
  assert.equal(result.rewrites[0].rewrittenValue, '/target/ws');
  assert.equal(result.rewrites[1].rewrittenValue, '/target/agent/config');
  assert.equal(result.blocked.length, 0);
});

test('computePathRewrites blocks external-absolute paths', () => {
  const analysis: SettingsAnalysis = {
    pathRefs: [
      { key: 'ext', value: '/usr/local/bin/tool', classification: 'external-absolute' },
    ],
    summary: { total: 1, packageInternalWorkspace: 0, packageInternalAgentDir: 0, relative: 0, externalAbsolute: 1, hostBound: 0 },
  };

  const result = computePathRewrites({
    settingsAnalysis: analysis,
    sourceWorkspacePath: '/src/ws',
    sourceAgentDir: '/src/ad',
    targetWorkspacePath: '/tgt/ws',
    targetAgentDir: '/tgt/ad',
  });

  assert.equal(result.blocked.length, 1);
  assert.ok(result.warnings.some((w) => w.includes('cannot be auto-rewritten')));
});

test('computePathRewrites warns on host-bound paths', () => {
  const analysis: SettingsAnalysis = {
    pathRefs: [
      { key: 'dev', value: '/dev/null', classification: 'host-bound' },
    ],
    summary: { total: 1, packageInternalWorkspace: 0, packageInternalAgentDir: 0, relative: 0, externalAbsolute: 0, hostBound: 1 },
  };

  const result = computePathRewrites({
    settingsAnalysis: analysis,
    sourceWorkspacePath: '/src/ws',
    sourceAgentDir: '/src/ad',
    targetWorkspacePath: '/tgt/ws',
    targetAgentDir: '/tgt/ad',
  });

  assert.equal(result.rewrites.length, 0);
  assert.equal(result.blocked.length, 0);
  assert.ok(result.warnings.some((w) => w.includes('Host-bound')));
});

test('applyPathRewrites replaces paths in nested objects', () => {
  const settings = {
    workspace: '/old/ws',
    nested: {
      agent: '/old/ad/config',
      list: ['/old/ws/file1', '/old/ad/file2', './relative'],
    },
    untouched: 'hello',
    num: 42,
  };

  const result = applyPathRewrites(settings, '/old/ws', '/old/ad', '/new/ws', '/new/ad');

  assert.equal(result.workspace, '/new/ws');
  assert.equal((result.nested as Record<string, unknown>).agent, '/new/ad/config');
  assert.deepEqual((result.nested as Record<string, unknown>).list, [
    '/new/ws/file1',
    '/new/ad/file2',
    './relative',
  ]);
  assert.equal(result.untouched, 'hello');
  assert.equal(result.num, 42);
});

test('applyPathRewrites prefers agentDir match over workspace for subpaths', () => {
  const settings = {
    agentPath: '/home/user/.oc/agent/settings',
    wsPath: '/home/user/.oc/workspace/file',
  };

  const result = applyPathRewrites(
    settings,
    '/home/user/.oc/workspace',
    '/home/user/.oc/agent',
    '/target/workspace',
    '/target/agent',
  );

  assert.equal(result.agentPath, '/target/agent/settings');
  assert.equal(result.wsPath, '/target/workspace/file');
});

test('applyPathRewrites handles exact matches (no trailing slash)', () => {
  const settings = {
    wsExact: '/old/ws',
    adExact: '/old/ad',
  };

  const result = applyPathRewrites(settings, '/old/ws', '/old/ad', '/new/ws', '/new/ad');

  assert.equal(result.wsExact, '/new/ws');
  assert.equal(result.adExact, '/new/ad');
});

test('applyPathRewrites leaves non-matching strings unchanged', () => {
  const settings = {
    unrelated: '/some/other/path',
    relative: './data',
    url: 'https://example.com',
  };

  const result = applyPathRewrites(settings, '/old/ws', '/old/ad', '/new/ws', '/new/ad');

  assert.equal(result.unrelated, '/some/other/path');
  assert.equal(result.relative, './data');
  assert.equal(result.url, 'https://example.com');
});
