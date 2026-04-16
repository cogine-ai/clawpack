import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  RuntimeArtifactBuckets,
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
    includedFiles: ['models.json'],
    excludedFiles: [{ relativePath: 'auth.json', reason: 'Always excluded: secrets' }],
    artifacts: {
      grounded: ['models.json'],
      inferred: ['settings.json'],
      unsupported: ['skills/demo/SKILL.md'],
    },
    warnings: [],
    modelsSanitized: true,
    modelsSkipped: false,
    settingsAnalysisIncluded: false,
  };
  assert.equal(manifest.mode, 'default');
  assert.equal(manifest.includedFiles.length, 1);
  assert.equal(manifest.artifacts.inferred.length, 1);
});

test('RuntimeScanResult structure is valid', () => {
  const result: RuntimeScanResult = {
    mode: 'default',
    agentDir: '/path/to/agentDir',
    includedFiles: [{ relativePath: 'models.json', absolutePath: '/abs/models.json' }],
    excludedFiles: [{ relativePath: 'auth.json', reason: 'Always excluded: secrets' }],
    artifacts: {
      grounded: ['models.json'],
      inferred: ['settings.json'],
      unsupported: ['extensions/ext/package.json'],
    },
    warnings: [],
    sanitizedModels: { models: [{ id: 'gpt-5' }] },
    settingsAnalysis: undefined,
  };
  assert.equal(result.mode, 'default');
  assert.equal(result.includedFiles.length, 1);
  assert.equal(result.artifacts.grounded[0], 'models.json');
});

test('RuntimeArtifactBuckets groups runtime evidence levels', () => {
  const buckets: RuntimeArtifactBuckets = {
    grounded: ['models.json'],
    inferred: ['settings.json'],
    unsupported: ['skills/demo/SKILL.md'],
  };
  assert.equal(buckets.grounded.length, 1);
  assert.equal(buckets.unsupported.length, 1);
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
