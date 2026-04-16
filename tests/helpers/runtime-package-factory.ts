import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checksumText } from '../../src/core/checksums';
import {
  RUNTIME_GROUNDED_ARTIFACTS,
  RUNTIME_INFERRED_ARTIFACTS,
  RUNTIME_UNSUPPORTED_ARTIFACTS,
} from '../../src/core/constants';
import { readPackageDirectory } from '../../src/core/package-read';
import type {
  ReadPackageResult,
  RuntimeArtifactBuckets,
  RuntimeManifest,
  RuntimeMode,
  SettingsAnalysis,
} from '../../src/core/types';

interface RuntimePackageOptions {
  runtimeFiles: Record<string, string>;
  sourceAgentDir: string;
  sourceWorkspacePath: string;
  packageName?: string;
  runtimeMode?: RuntimeMode;
  settingsAnalysis?: SettingsAnalysis;
  artifacts?: RuntimeArtifactBuckets;
}

/**
 * Builds a minimal valid .ocpkg directory that includes a runtime subtree.
 * Used for testing import-plan, import-exec, and validate with runtime content.
 */
export async function buildRuntimeTestPackage(
  outputPath: string,
  options: RuntimePackageOptions,
): Promise<ReadPackageResult> {
  await rm(outputPath, { recursive: true, force: true });

  await mkdir(path.join(outputPath, 'workspace'), { recursive: true });
  await mkdir(path.join(outputPath, 'config'), { recursive: true });
  await mkdir(path.join(outputPath, 'meta'), { recursive: true });
  await mkdir(path.join(outputPath, 'runtime', 'files'), { recursive: true });

  const checksums: Record<string, string> = {};
  const runtimeChecksums: Record<string, string> = {};

  const workspaceFiles = [
    'AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'TOOLS.md', 'MEMORY.md',
  ];
  for (const file of workspaceFiles) {
    const content = `# ${file.replace('.md', '')}\n`;
    const filePath = path.join(outputPath, 'workspace', file);
    await writeFile(filePath, content, 'utf8');
    checksums[`workspace/${file}`] = checksumText(content);
  }

  const mode = options.runtimeMode ?? 'default';
  const runtimeFileEntries = Object.entries(options.runtimeFiles);
  const includedFiles: string[] = [];

  for (const [relPath, content] of runtimeFileEntries) {
    const filePath = path.join(outputPath, 'runtime', 'files', relPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    const normalized = content.endsWith('\n') ? content : `${content}\n`;
    await writeFile(filePath, normalized, 'utf8');
    const checksumKey = `runtime/files/${relPath}`;
    runtimeChecksums[checksumKey] = checksumText(normalized);
    checksums[checksumKey] = checksumText(normalized);
    includedFiles.push(relPath);
  }

  const artifacts = options.artifacts ?? classifyRuntimeArtifacts(mode === 'none' ? [] : includedFiles);

  const runtimeManifest: RuntimeManifest = {
    mode,
    agentDir: options.sourceAgentDir,
    includedFiles: mode === 'none' ? [] : includedFiles,
    excludedFiles: [],
    artifacts,
    warnings: [],
    modelsSanitized: false,
    modelsSkipped: true,
    settingsAnalysisIncluded: options.settingsAnalysis !== undefined,
  };

  const runtimeManifestJson = JSON.stringify(runtimeManifest, null, 2);
  await writeFile(path.join(outputPath, 'runtime', 'manifest.json'), `${runtimeManifestJson}\n`, 'utf8');
  checksums['runtime/manifest.json'] = checksumText(`${runtimeManifestJson}\n`);

  const runtimeChecksumsJson = JSON.stringify(runtimeChecksums, null, 2);
  await writeFile(path.join(outputPath, 'runtime', 'checksums.json'), `${runtimeChecksumsJson}\n`, 'utf8');
  checksums['runtime/checksums.json'] = checksumText(`${runtimeChecksumsJson}\n`);

  const pathRewritesJson = JSON.stringify({}, null, 2);
  await writeFile(path.join(outputPath, 'runtime', 'path-rewrites.json'), `${pathRewritesJson}\n`, 'utf8');
  checksums['runtime/path-rewrites.json'] = checksumText(`${pathRewritesJson}\n`);

  if (options.settingsAnalysis) {
    const analysisJson = JSON.stringify(options.settingsAnalysis, null, 2);
    await writeFile(path.join(outputPath, 'runtime', 'settings-analysis.json'), `${analysisJson}\n`, 'utf8');
  }

  const agentDef = {
    agent: {
      suggestedId: 'test-agent',
      suggestedName: 'Test Agent',
      workspace: { suggestedBasename: 'workspace-test' },
      identity: { name: 'Test Agent' },
    },
    fieldClassification: {
      'agent.suggestedId': 'requiresInputOnImport',
      'agent.suggestedName': 'portable',
      'agent.workspace.suggestedBasename': 'requiresInputOnImport',
      'agent.identity': 'portable',
    },
    notes: ['Test package.'],
  };

  const skills = {
    mode: 'manifest-only',
    workspaceSkills: [],
    referencedSkills: [],
    notes: [],
  };

  const importHints = {
    requiredInputs: [
      { key: 'agentId', reason: 'Target instance may already contain the source agent id.' },
    ],
    warnings: ['Skills are manifest-only and may require manual installation.'],
  };

  const manifest = {
    formatVersion: 2,
    packageType: 'openclaw-agent-template',
    name: options.packageName ?? 'test-runtime-pkg',
    exportMode: 'template',
    source: {
      agentId: 'test-agent',
      workspaceName: 'workspace-test',
    },
    includes: {
      workspaceFiles,
      bootstrapFiles: workspaceFiles,
      dailyMemory: false,
      skills: 'manifest-only',
      agentDefinition: true,
      bindings: false,
      cronJobs: false,
      runtimeMode: mode,
      runtimeFiles: mode !== 'none' ? includedFiles : [],
    },
    excludes: {
      secrets: true,
      sessionState: true,
      channelBindings: true,
      globalExtensions: true,
      connectionState: false,
    },
    compatibility: {
      minFormatVersion: 1,
      notes: [],
    },
  };

  const exportReport = {
    packageName: options.packageName ?? 'test-runtime-pkg',
    workspacePath: options.sourceWorkspacePath,
    includedFiles: workspaceFiles,
    bootstrapFiles: workspaceFiles,
    excludedFiles: [],
    warnings: [],
    skills,
    runtime: runtimeManifest,
  };

  const files: Array<[string, unknown]> = [
    ['config/agent.json', agentDef],
    ['config/skills-manifest.json', skills],
    ['config/import-hints.json', importHints],
  ];

  for (const [relPath, data] of files) {
    const json = JSON.stringify(data, null, 2);
    await writeFile(path.join(outputPath, relPath), `${json}\n`, 'utf8');
    checksums[relPath] = checksumText(`${json}\n`);
  }

  const checksumsJson = JSON.stringify(checksums, null, 2);
  await writeFile(path.join(outputPath, 'meta', 'checksums.json'), `${checksumsJson}\n`, 'utf8');

  const reportJson = JSON.stringify(exportReport, null, 2);
  await writeFile(path.join(outputPath, 'meta', 'export-report.json'), `${reportJson}\n`, 'utf8');

  const manifestJson = JSON.stringify(manifest, null, 2);
  await writeFile(path.join(outputPath, 'manifest.json'), `${manifestJson}\n`, 'utf8');

  return readPackageDirectory(outputPath);
}

function classifyRuntimeArtifacts(includedFiles: string[]): RuntimeArtifactBuckets {
  const artifacts: RuntimeArtifactBuckets = {
    grounded: [],
    inferred: [],
    unsupported: [],
  };

  for (const relativePath of includedFiles) {
    if (matchesPattern(relativePath, RUNTIME_GROUNDED_ARTIFACTS)) {
      artifacts.grounded.push(relativePath);
      continue;
    }
    if (matchesPattern(relativePath, RUNTIME_INFERRED_ARTIFACTS)) {
      artifacts.inferred.push(relativePath);
      continue;
    }
    if (matchesPattern(relativePath, RUNTIME_UNSUPPORTED_ARTIFACTS)) {
      artifacts.unsupported.push(relativePath);
    }
  }

  return {
    grounded: artifacts.grounded.sort((left, right) => left.localeCompare(right)),
    inferred: artifacts.inferred.sort((left, right) => left.localeCompare(right)),
    unsupported: artifacts.unsupported.sort((left, right) => left.localeCompare(right)),
  };
}

function matchesPattern(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (relativePath.startsWith(`${prefix}/`)) {
        return true;
      }
      continue;
    }

    if (pattern === relativePath) {
      return true;
    }
  }

  return false;
}
