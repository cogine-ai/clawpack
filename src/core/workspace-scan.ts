import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { BOOTSTRAP_FILES, EXCLUDED_DIRECTORIES, EXCLUDED_PATTERNS } from './constants';
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

      if (isExcludedByPattern(relativePath, entry.name, true)) {
        excluded.push({
          relativePath: `${relativePath}/`,
          reason: matchedExclusionReason(relativePath, entry.name, true),
        });
        continue;
      }

      await collectFiles(rootPath, relativePath, included, excluded);
      continue;
    }

    if (!entry.isFile()) continue;

    if (isExcludedByPattern(relativePath, entry.name, false)) {
      excluded.push({
        relativePath,
        reason: matchedExclusionReason(relativePath, entry.name, false),
      });
      continue;
    }

    const absolutePath = path.join(rootPath, relativePath);
    const isBootstrap = BOOTSTRAP_FILES.has(entry.name) && !relativeDirPath;

    included.push({ relativePath, absolutePath, isBootstrap });
  }
}

function isExcludedByPattern(relativePath: string, name: string, isDir: boolean): boolean {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.dirOnly && !isDir) continue;
    if (pattern.test(relativePath, name)) return true;
  }
  return false;
}

function matchedExclusionReason(relativePath: string, name: string, isDir: boolean): string {
  for (const pattern of EXCLUDED_PATTERNS) {
    if (pattern.dirOnly && !isDir) continue;
    if (pattern.test(relativePath, name)) return pattern.reason;
  }
  return 'Excluded by pattern';
}
