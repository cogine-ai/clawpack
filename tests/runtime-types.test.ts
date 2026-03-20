import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  RuntimeManifest,
  RuntimeMode,
  RuntimeScanResult,
  SettingsAnalysis,
  SettingsPathRef,
} from '../src/core/types';

test('RuntimeMode type accepts valid values', () => {
  const modes: RuntimeMode[] = ['none', 'default', 'full'];
  assert.deepEqual(modes, ['none', 'default', 'full']);
});

test('RuntimeManifest structure is valid', () => {
  const manifest: RuntimeManifest = {
    mode: 'default',
    agentDir: '/path/to/agentDir',
    includedFiles: ['AGENTS.md', 'settings.json'],
    excludedFiles: [{ relativePath: 'auth.json', reason: 'Always excluded: secrets' }],
    warnings: [],
    modelsSanitized: false,
    modelsSkipped: false,
    settingsAnalysisIncluded: false,
  };
  assert.equal(manifest.mode, 'default');
  assert.equal(manifest.includedFiles.length, 2);
});

test('RuntimeScanResult structure is valid', () => {
  const result: RuntimeScanResult = {
    mode: 'default',
    agentDir: '/path/to/agentDir',
    includedFiles: [{ relativePath: 'settings.json', absolutePath: '/abs/settings.json' }],
    excludedFiles: [{ relativePath: 'auth.json', reason: 'Always excluded: secrets' }],
    warnings: [],
    sanitizedModels: undefined,
    settingsAnalysis: undefined,
  };
  assert.equal(result.mode, 'default');
  assert.equal(result.includedFiles.length, 1);
});

test('SettingsAnalysis structure is valid', () => {
  const analysis: SettingsAnalysis = {
    pathRefs: [
      {
        key: 'editor.fontFamily',
        value: '/usr/share/fonts/custom.ttf',
        classification: 'external-absolute',
      } satisfies SettingsPathRef,
    ],
    summary: {
      total: 1,
      packageInternalWorkspace: 0,
      packageInternalAgentDir: 0,
      relative: 0,
      externalAbsolute: 1,
      hostBound: 0,
    },
  };
  assert.equal(analysis.pathRefs.length, 1);
  assert.equal(analysis.summary.externalAbsolute, 1);
});
