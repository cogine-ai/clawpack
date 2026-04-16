import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { EXCLUDED_DIRECTORIES, EXCLUDED_PATTERNS, OPENCLAW_BOOTSTRAP_FILES } from './constants';
import type { WorkspaceScanResult } from './types';

export async function scanWorkspace(workspacePath: string): Promise<WorkspaceScanResult> {
  const includedFiles = [] as WorkspaceScanResult['includedFiles'];
  const excludedFiles = [] as WorkspaceScanResult['excludedFiles'];

  await collectFiles(workspacePath, '', includedFiles, excludedFiles);

  return {
    workspacePath,
    includedFiles: includedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    excludedFiles: excludedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
  };
}

async function collectFiles(
  rootPath: string,
  relativeDirPath: string,
  included: WorkspaceScanResult['includedFiles'],
  excluded: WorkspaceScanResult['excludedFiles'],
): Promise<void> {
  const currentDir = relativeDirPath
    ? path.join(rootPath, relativeDirPath)
    : rootPath;

  const entries = await readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = relativeDirPath
      ? path.posix.join(relativeDirPath, entry.name)
      : entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.has(entry.name)) {
        excluded.push({
          relativePath: `${relativePath}/`,
          reason: `Excluded directory: ${entry.name}`,
        });
        continue;
      }

      const dirExclusion = getExclusionReason(relativePath, entry.name, true);
      if (dirExclusion) {
        excluded.push({ relativePath: `${relativePath}/`, reason: dirExclusion });
        continue;
      }

      await collectFiles(rootPath, relativePath, included, excluded);
      continue;
    }

    if (!entry.isFile()) continue;

    const fileExclusion = getExclusionReason(relativePath, entry.name, false);
    if (fileExclusion) {
      excluded.push({ relativePath, reason: fileExclusion });
      continue;
    }

    const absolutePath = path.join(rootPath, relativePath);
    const isBootstrap = OPENCLAW_BOOTSTRAP_FILES.has(entry.name) && !relativeDirPath;

    included.push({ relativePath, absolutePath, isBootstrap });
  }
}

function getExclusionReason(relativePath: string, name: string, isDir: boolean): string | null {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.dirOnly && !isDir) continue;
    if (pattern.test(relativePath, name)) return pattern.reason;
  }
  return null;
}
