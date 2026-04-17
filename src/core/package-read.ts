import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readJsonFile } from '../utils/json';
import { extractArchive, isArchivePath } from './archive';
import { checksumFile } from './checksums';
import { MIN_READABLE_FORMAT_VERSION, PACKAGE_FORMAT_VERSION, PACKAGE_TYPE } from './constants';
import type {
  AgentBindingDefinition,
  AgentDefinition,
  ExportReport,
  ImportHints,
  PackageManifest,
  ReadPackageResult,
  RuntimeManifest,
  SkillsManifest,
} from './types';

export interface ReadPackageOptions {
  onTempDir?: (tempDir: string) => void;
}

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
  if (typeof manifest.formatVersion !== 'number' || !Number.isInteger(manifest.formatVersion)) {
    throw new Error(`Invalid format version: expected integer, got ${JSON.stringify(manifest.formatVersion)}`);
  }
  if (manifest.formatVersion < MIN_READABLE_FORMAT_VERSION || manifest.formatVersion > PACKAGE_FORMAT_VERSION) {
    throw new Error(`Unsupported format version: ${manifest.formatVersion}`);
  }

  manifest.includes.bootstrapFiles ??= [];
  delete (manifest.includes as { cronJobs?: unknown }).cronJobs;
  manifest.excludes.connectionState ??= false;

  const agentDefinition = await readJsonFile<AgentDefinition>(
    path.join(resolvedRoot, 'config', 'agent.json'),
  );
  const skillsManifest = await readJsonFile<SkillsManifest>(
    path.join(resolvedRoot, 'config', 'skills-manifest.json'),
  );
  const importHints = await readJsonFile<ImportHints>(
    path.join(resolvedRoot, 'config', 'import-hints.json'),
  );
  const checksums = await readJsonFile<Record<string, string>>(
    path.join(resolvedRoot, 'meta', 'checksums.json'),
  );
  const exportReport = await readJsonFile<ExportReport>(
    path.join(resolvedRoot, 'meta', 'export-report.json'),
  );

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

  const bindingHintsPath = path.join(resolvedRoot, 'meta', 'binding-hints.json');

  const bindingHints = await readOptionalJsonFile<AgentBindingDefinition[]>(bindingHintsPath);

  const runtimeManifestPath = path.join(resolvedRoot, 'runtime', 'manifest.json');
  const runtimeManifest = await readOptionalJsonFile<RuntimeManifest>(runtimeManifestPath);

  return {
    packageRoot: resolvedRoot,
    manifest,
    agentDefinition,
    skillsManifest,
    importHints,
    checksums,
    exportReport,
    workspaceFiles,
    bindingHints,
    runtimeManifest,
  };
}

async function readOptionalJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    await access(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  return readJsonFile<T>(filePath);
}
