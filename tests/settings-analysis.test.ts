import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeSettingsJson } from '../src/core/settings-analysis';

test('analyzeSettingsJson classifies absolute paths as external-absolute', () => {
  const settings = { 'editor.fontPath': '/usr/share/fonts/custom.ttf' };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  const ref = result.pathRefs.find(r => r.key === 'editor.fontPath');
  assert.ok(ref);
  assert.equal(ref!.classification, 'external-absolute');
});

test('analyzeSettingsJson classifies tilde paths as external-absolute', () => {
  const settings = { 'custom.config': '~/config/settings.yaml' };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  const ref = result.pathRefs.find(r => r.key === 'custom.config');
  assert.ok(ref);
  assert.equal(ref!.classification, 'external-absolute');
});

test('analyzeSettingsJson classifies relative paths as relative', () => {
  const settings = { 'data.path': './data/output.csv' };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  const ref = result.pathRefs.find(r => r.key === 'data.path');
  assert.ok(ref);
  assert.equal(ref!.classification, 'relative');
});

test('analyzeSettingsJson classifies workspace-internal paths', () => {
  const settings = { 'output.dir': '/home/user/workspace/output' };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  const ref = result.pathRefs.find(r => r.key === 'output.dir');
  assert.ok(ref);
  assert.equal(ref!.classification, 'package-internal-workspace');
});

test('analyzeSettingsJson classifies agentDir-internal paths', () => {
  const settings = { 'state.path': '/home/user/.openclaw/agents/test/state.json' };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  const ref = result.pathRefs.find(r => r.key === 'state.path');
  assert.ok(ref);
  assert.equal(ref!.classification, 'package-internal-agentDir');
});

test('analyzeSettingsJson classifies platform-specific paths as host-bound', () => {
  const settings = {
    'win.path': 'C:\\Users\\test\\file.txt',
    'proc.path': '/proc/cpuinfo',
    'dev.path': '/dev/null',
  };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  for (const ref of result.pathRefs) {
    assert.equal(ref.classification, 'host-bound');
  }
});

test('analyzeSettingsJson ignores non-path string values', () => {
  const settings = {
    'editor.theme': 'dark',
    'editor.fontSize': 14,
    'editor.wordWrap': true,
    'editor.fontFamily': 'Fira Code',
  };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  assert.equal(result.pathRefs.length, 0);
});

test('analyzeSettingsJson produces correct summary counts', () => {
  const settings = {
    a: '/home/user/workspace/a.txt',
    b: '/home/user/.openclaw/agents/test/b.json',
    c: './c.md',
    d: '/usr/bin/something',
    e: 'C:\\Windows\\file',
  };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.packageInternalWorkspace, 1);
  assert.equal(result.summary.packageInternalAgentDir, 1);
  assert.equal(result.summary.relative, 1);
  assert.equal(result.summary.externalAbsolute, 1);
  assert.equal(result.summary.hostBound, 1);
});

test('analyzeSettingsJson handles nested settings objects', () => {
  const settings = {
    editor: { fontPath: '/usr/share/fonts/font.ttf' },
    nested: { deep: { path: './relative/path' } },
  };
  const result = analyzeSettingsJson(settings, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  assert.equal(result.pathRefs.length, 2);
});

test('analyzeSettingsJson handles empty settings', () => {
  const result = analyzeSettingsJson({}, {
    workspacePath: '/home/user/workspace',
    agentDir: '/home/user/.openclaw/agents/test',
  });
  assert.equal(result.pathRefs.length, 0);
  assert.equal(result.summary.total, 0);
});
