import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createArchive, deriveArchivePath } from './archive';
import { checksumFile, checksumText } from './checksums';
import { buildExportArtifacts } from './manifest';
import type {
  AgentDefinition,
  ExportPackageResult,
  ImportHints,
  SkillsManifest,
  WorkspaceScanResult,
} from './types';

export async function writePackageArchive(params: {
  outputPath: string;
  packageName: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
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
      manifestPath: dirResult.manifestPath,
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
}): Promise<ExportPackageResult> {
  await rm(params.outputPath, { recursive: true, force: true });
  await mkdir(path.join(params.outputPath, 'workspace'), { recursive: true });
  await mkdir(path.join(params.outputPath, 'config'), { recursive: true });
  await mkdir(path.join(params.outputPath, 'meta'), { recursive: true });

  const checksums: Record<string, string> = {};

  for (const file of params.scan.includedFiles) {
    const targetPath = path.join(params.outputPath, 'workspace', file.relativePath);
    await cp(file.absolutePath, targetPath);
    checksums[path.posix.join('workspace', file.relativePath)] = await checksumFile(targetPath);
  }

  const importHints: ImportHints = {
    requiredInputs: [
      { key: 'agentId', reason: 'Target instance may already contain the source agent id.' },
    ],
    warnings: [
      'Channel bindings are not included in v1 packages.',
      'Skills are manifest-only and may require manual installation.',
    ],
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

  const artifacts = buildExportArtifacts({
    packageName: params.packageName,
    workspacePath: params.scan.workspacePath,
    scan: params.scan,
    skills: params.skills,
    agentDefinition: params.agentDefinition,
    checksums,
    warnings: importHints.warnings,
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
