import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ALLOWED_WORKSPACE_FILES, OPTIONAL_WORKSPACE_FILES } from './constants';
import type { WorkspaceScanResult } from './types';

export async function scanWorkspace(workspacePath: string): Promise<WorkspaceScanResult> {
  const entries = await readdir(workspacePath, { withFileTypes: true });
  const includedFiles = [] as WorkspaceScanResult['includedFiles'];
  const excludedFiles = [] as WorkspaceScanResult['excludedFiles'];
  const missingOptionalFiles: string[] = [];
  const ignoredFiles: string[] = [];

  for (const file of ALLOWED_WORKSPACE_FILES) {
    const absolutePath = path.join(workspacePath, file);
    try {
      await access(absolutePath);
      includedFiles.push({
        relativePath: file,
        absolutePath,
        required: !OPTIONAL_WORKSPACE_FILES.includes(file as (typeof OPTIONAL_WORKSPACE_FILES)[number]),
      });
    } catch {
      if (OPTIONAL_WORKSPACE_FILES.includes(file as (typeof OPTIONAL_WORKSPACE_FILES)[number])) {
        missingOptionalFiles.push(file);
      }
    }
  }

  for (const entry of entries) {
    if (entry.name === 'memory' && entry.isDirectory()) {
      const memoryEntries = await readdir(path.join(workspacePath, 'memory'), { withFileTypes: true });
      for (const memoryEntry of memoryEntries) {
        if (memoryEntry.isFile() && memoryEntry.name.endsWith('.md')) {
          excludedFiles.push({
            relativePath: path.posix.join('memory', memoryEntry.name),
            reason: 'Excluded by default daily memory policy',
          });
        }
      }
      continue;
    }

    if (!ALLOWED_WORKSPACE_FILES.includes(entry.name as (typeof ALLOWED_WORKSPACE_FILES)[number])) {
      ignoredFiles.push(entry.name);
    }
  }

  return {
    workspacePath,
    includedFiles: includedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    excludedFiles: excludedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    missingOptionalFiles: missingOptionalFiles.sort(),
    ignoredFiles: ignoredFiles.sort(),
  };
}
