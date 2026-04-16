import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArchive, deriveArchivePath } from './archive';
import { checksumFile, checksumText } from './checksums';
import { buildRuntimeCompatibility } from './compatibility';
import { buildExportArtifacts } from './manifest';
import type {
  AgentBindingDefinition,
  AgentDefinition,
  CronJobDefinition,
  ExportPackageResult,
  ImportHints,
  RuntimeManifest,
  RuntimeScanResult,
  SkillsManifest,
  WorkspaceScanResult,
} from './types';

export async function writePackageArchive(params: {
  outputPath: string;
  packageName: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
  openclawVersion?: string;
  bindings?: AgentBindingDefinition[];
  cronJobs?: CronJobDefinition[];
  runtimeScan?: RuntimeScanResult;
}): Promise<ExportPackageResult> {
  const archivePath = deriveArchivePath(params.outputPath);
  const stagingDir = `${params.outputPath}.staging`;

  try {
    const dirResult = await writePackageDirectory({
      ...params,
      outputPath: stagingDir,
    });

    await createArchive(stagingDir, archivePath);

    return {
      packageRoot: archivePath,
      manifestPath: archivePath,
      fileCount: dirResult.fileCount,
    };
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function writePackageDirectory(params: {
  outputPath: string;
  packageName: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
  openclawVersion?: string;
  bindings?: AgentBindingDefinition[];
  cronJobs?: CronJobDefinition[];
  runtimeScan?: RuntimeScanResult;
}): Promise<ExportPackageResult> {
  await rm(params.outputPath, { recursive: true, force: true });
  await mkdir(path.join(params.outputPath, 'workspace'), { recursive: true });
  await mkdir(path.join(params.outputPath, 'config'), { recursive: true });
  await mkdir(path.join(params.outputPath, 'meta'), { recursive: true });

  const checksums: Record<string, string> = {};

  for (const file of params.scan.includedFiles) {
    const targetPath = path.join(params.outputPath, 'workspace', file.relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(file.absolutePath, targetPath);
    checksums[path.posix.join('workspace', file.relativePath)] = await checksumFile(targetPath);
  }

  const warnings = [
    'Skills are manifest-only and may require manual installation.',
    'This clawpacker version does not package live bindings or scheduled jobs; reconfigure them manually on the target instance.',
  ];

  const importHints: ImportHints = {
    requiredInputs: [
      { key: 'agentId', reason: 'Target instance may already contain the source agent id.' },
    ],
    warnings,
  };

  const skillsJson = JSON.stringify(params.skills, null, 2);
  const agentJson = JSON.stringify(params.agentDefinition, null, 2);
  const importHintsJson = JSON.stringify(importHints, null, 2);
  await writeFile(
    path.join(params.outputPath, 'config', 'skills-manifest.json'),
    `${skillsJson}\n`,
    'utf8',
  );
  await writeFile(path.join(params.outputPath, 'config', 'agent.json'), `${agentJson}\n`, 'utf8');
  await writeFile(
    path.join(params.outputPath, 'config', 'import-hints.json'),
    `${importHintsJson}\n`,
    'utf8',
  );
  checksums['config/skills-manifest.json'] = checksumText(`${skillsJson}\n`);
  checksums['config/agent.json'] = checksumText(`${agentJson}\n`);
  checksums['config/import-hints.json'] = checksumText(`${importHintsJson}\n`);

  if (params.bindings && params.bindings.length > 0) {
    const bindingsJson = JSON.stringify(params.bindings, null, 2);
    await writeFile(path.join(params.outputPath, 'config', 'bindings.json'), `${bindingsJson}\n`, 'utf8');
    checksums['config/bindings.json'] = checksumText(`${bindingsJson}\n`);
  }

  if (params.cronJobs && params.cronJobs.length > 0) {
    const cronJson = JSON.stringify(params.cronJobs, null, 2);
    await writeFile(path.join(params.outputPath, 'config', 'cron.json'), `${cronJson}\n`, 'utf8');
    checksums['config/cron.json'] = checksumText(`${cronJson}\n`);
  }

  let runtimeManifestData: RuntimeManifest | undefined;

  const shouldWriteRuntimeMetadata =
    params.runtimeScan &&
    params.runtimeScan.mode !== 'none' &&
    (
      params.runtimeScan.includedFiles.length > 0 ||
      params.runtimeScan.excludedFiles.length > 0 ||
      params.runtimeScan.warnings.length > 0 ||
      params.runtimeScan.sanitizedModels !== undefined ||
      params.runtimeScan.settingsAnalysis !== undefined
    );

  if (shouldWriteRuntimeMetadata) {
    const runtimeScan = params.runtimeScan!;
    const runtimeDir = path.join(params.outputPath, 'runtime');
    const runtimeFilesDir = path.join(runtimeDir, 'files');
    await mkdir(runtimeFilesDir, { recursive: true });

    const runtimeChecksums: Record<string, string> = {};

    for (const file of runtimeScan.includedFiles) {
      const targetPath = path.join(runtimeFilesDir, file.relativePath);
      await mkdir(path.dirname(targetPath), { recursive: true });

      if (file.relativePath === 'models.json' && runtimeScan.sanitizedModels) {
        const sanitizedJson = JSON.stringify(runtimeScan.sanitizedModels, null, 2);
        await writeFile(targetPath, `${sanitizedJson}\n`, 'utf8');
        runtimeChecksums[path.posix.join('runtime/files', file.relativePath)] = checksumText(`${sanitizedJson}\n`);
      } else {
        await cp(file.absolutePath, targetPath);
        runtimeChecksums[path.posix.join('runtime/files', file.relativePath)] = await checksumFile(targetPath);
      }
    }

    runtimeManifestData = {
      mode: runtimeScan.mode,
      agentDir: runtimeScan.agentDir,
      includedFiles: runtimeScan.includedFiles.map(f => f.relativePath),
      excludedFiles: runtimeScan.excludedFiles,
      artifacts: runtimeScan.artifacts,
      warnings: runtimeScan.warnings,
      modelsSanitized: runtimeScan.sanitizedModels !== undefined,
      modelsSkipped: runtimeScan.sanitizedModels === undefined &&
        !runtimeScan.includedFiles.some(f => f.relativePath === 'models.json') &&
        runtimeScan.warnings.some(w => w.includes('models.json')),
      settingsAnalysisIncluded: runtimeScan.settingsAnalysis !== undefined,
      compatibility: runtimeScan.compatibility ?? buildRuntimeCompatibility(runtimeScan.artifacts, runtimeScan.warnings),
    };

    const runtimeManifestJson = JSON.stringify(runtimeManifestData, null, 2);
    await writeFile(path.join(runtimeDir, 'manifest.json'), `${runtimeManifestJson}\n`, 'utf8');

    const runtimeChecksumsJson = JSON.stringify(runtimeChecksums, null, 2);
    await writeFile(path.join(runtimeDir, 'checksums.json'), `${runtimeChecksumsJson}\n`, 'utf8');

    const pathRewrites = JSON.stringify({}, null, 2);
    await writeFile(path.join(runtimeDir, 'path-rewrites.json'), `${pathRewrites}\n`, 'utf8');

    if (runtimeScan.settingsAnalysis) {
      const analysisJson = JSON.stringify(runtimeScan.settingsAnalysis, null, 2);
      await writeFile(path.join(runtimeDir, 'settings-analysis.json'), `${analysisJson}\n`, 'utf8');
    }

    checksums['runtime/manifest.json'] = checksumText(`${runtimeManifestJson}\n`);
    checksums['runtime/checksums.json'] = checksumText(`${runtimeChecksumsJson}\n`);
    checksums['runtime/path-rewrites.json'] = checksumText(`${pathRewrites}\n`);
    Object.assign(checksums, runtimeChecksums);
  }

  const artifacts = buildExportArtifacts({
    packageName: params.packageName,
    workspacePath: params.scan.workspacePath,
    scan: params.scan,
    skills: params.skills,
    agentDefinition: params.agentDefinition,
    openclawVersion: params.openclawVersion,
    checksums,
    warnings: importHints.warnings,
    hasBindings: (params.bindings?.length ?? 0) > 0,
    hasCronJobs: (params.cronJobs?.length ?? 0) > 0,
    runtimeScan: params.runtimeScan,
    runtimeManifest: runtimeManifestData,
  });

  const manifestJson = JSON.stringify(artifacts.manifest, null, 2);
  const checksumsJson = JSON.stringify(artifacts.checksums, null, 2);
  const reportJson = JSON.stringify(artifacts.exportReport, null, 2);

  await writeFile(path.join(params.outputPath, 'manifest.json'), `${manifestJson}\n`, 'utf8');
  await writeFile(
    path.join(params.outputPath, 'meta', 'checksums.json'),
    `${checksumsJson}\n`,
    'utf8',
  );
  await writeFile(
    path.join(params.outputPath, 'meta', 'export-report.json'),
    `${reportJson}\n`,
    'utf8',
  );

  return {
    packageRoot: params.outputPath,
    manifestPath: path.join(params.outputPath, 'manifest.json'),
    fileCount: Object.keys(checksums).length + 3,
  };
}
