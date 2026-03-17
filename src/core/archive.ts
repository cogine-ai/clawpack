import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as tar from 'tar';

const ARCHIVE_SUFFIX = '.ocpkg.tar.gz';

export function isArchivePath(filePath: string): boolean {
  return filePath.endsWith(ARCHIVE_SUFFIX) || filePath.endsWith('.tar.gz');
}

export function deriveArchivePath(directoryOutputPath: string): string {
  const base = directoryOutputPath.replace(/\.ocpkg\/?$/, '');
  return `${base}${ARCHIVE_SUFFIX}`;
}

export async function createArchive(sourceDir: string, archivePath: string): Promise<void> {
  const parentDir = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);

  await tar.create(
    {
      gzip: true,
      file: archivePath,
      cwd: parentDir,
      portable: true,
    },
    [folderName],
  );
}

export async function extractArchive(archivePath: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'clawpacker-'));

  try {
    await tar.extract({
      file: archivePath,
      cwd: tempDir,
    });
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }

  return tempDir;
}

export async function cleanupTempDir(tempDir: string): Promise<void> {
  await rm(tempDir, { recursive: true, force: true });
}
