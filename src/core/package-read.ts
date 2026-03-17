import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { cleanupTempDir, extractArchive, isArchivePath } from './archive';
import { PACKAGE_FORMAT_VERSION, PACKAGE_TYPE } from './constants';
import { checksumFile } from './checksums';
import type { ExportReport, ImportHints, PackageManifest, ReadPackageResult, SkillsManifest, AgentDefinition } from './types';
import { readJsonFile } from '../utils/json';

export interface ReadPackageOptions {
  onTempDir?: (tempDir: string) => void;
}

/**
 * Reads an .ocpkg package from either a directory or a .tar.gz archive.
 * When the input is an archive, it extracts to a temp directory and calls
 * `options.onTempDir` so the caller can schedule cleanup.
 */
export async function readPackage(
  packagePath: string,
  options?: ReadPackageOptions,
): Promise<ReadPackageResult> {
  const resolved = path.resolve(packagePath);
  const fileStat = await stat(resolved);

  if (fileStat.isFile() && isArchivePath(resolved)) {
    const tempDir = await extractArchive(resolved);
    options?.onTempDir?.(tempDir);

    const entries = await findPackageRoot(tempDir);
    return readPackageDirectory(entries);
  }

  return readPackageDirectory(resolved);
}

async function findPackageRoot(extractedDir: string): Promise<string> {
  const entries = await readdir(extractedDir);
  if (entries.length === 1) {
    const candidate = path.join(extractedDir, entries[0]);
    const candidateStat = await stat(candidate);
    if (candidateStat.isDirectory()) {
      return candidate;
    }
  }
  return extractedDir;
}

export { cleanupTempDir } from './archive';

export async function readPackageDirectory(packageRoot: string): Promise<ReadPackageResult> {
  const resolvedRoot = path.resolve(packageRoot);
  const requiredPaths = [
    'manifest.json',
    'config/agent.json',
    'config/skills-manifest.json',
    'config/import-hints.json',
    'meta/checksums.json',
    'meta/export-report.json',
    'workspace',
  ];

  for (const relativePath of requiredPaths) {
    try {
      await access(path.join(resolvedRoot, relativePath));
    } catch {
      throw new Error(`Invalid package structure: missing ${relativePath}`);
    }
  }

  const manifest = await readJsonFile<PackageManifest>(path.join(resolvedRoot, 'manifest.json'));
  if (manifest.packageType !== PACKAGE_TYPE) {
    throw new Error(`Unsupported package type: ${manifest.packageType}`);
  }
  if (manifest.formatVersion !== PACKAGE_FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${manifest.formatVersion}`);
  }

  const agentDefinition = await readJsonFile<AgentDefinition>(path.join(resolvedRoot, 'config', 'agent.json'));
  const skillsManifest = await readJsonFile<SkillsManifest>(path.join(resolvedRoot, 'config', 'skills-manifest.json'));
  const importHints = await readJsonFile<ImportHints>(path.join(resolvedRoot, 'config', 'import-hints.json'));
  const checksums = await readJsonFile<Record<string, string>>(path.join(resolvedRoot, 'meta', 'checksums.json'));
  const exportReport = await readJsonFile<ExportReport>(path.join(resolvedRoot, 'meta', 'export-report.json'));

  for (const [relativePath, expectedChecksum] of Object.entries(checksums)) {
    const actualChecksum = await checksumFile(path.join(resolvedRoot, relativePath));
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Checksum mismatch for ${relativePath}`);
    }
  }

  const workspaceFiles = manifest.includes.workspaceFiles.map((relativePath) => ({
    relativePath,
    absolutePath: path.join(resolvedRoot, 'workspace', relativePath),
  }));

  return {
    packageRoot: resolvedRoot,
    manifest,
    agentDefinition,
    skillsManifest,
    importHints,
    checksums,
    exportReport,
    workspaceFiles,
  };
}
