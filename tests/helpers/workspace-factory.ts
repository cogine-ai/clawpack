import { mkdir, rm, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { REQUIRED_WORKSPACE_FILES } from '../../src/core/constants';

const DEFAULT_CONTENT: Record<string, string> = {
  'AGENTS.md': '# AGENTS\n',
  'SOUL.md': '# SOUL\n',
  'IDENTITY.md': '# IDENTITY\n',
  'USER.md': '# USER\n',
  'TOOLS.md': '# TOOLS\n',
  'MEMORY.md': '# MEMORY\n',
};

export async function createTempWorkspace(
  basePath: string,
  options?: {
    files?: Record<string, string>;
    skipRequired?: string[];
    createSkillsDir?: boolean;
    createMemoryDir?: boolean;
    memoryFiles?: Record<string, string>;
    symlinks?: Record<string, string>;
    extraFiles?: Record<string, string>;
  },
): Promise<string> {
  await rm(basePath, { recursive: true, force: true });
  await mkdir(basePath, { recursive: true });

  const skip = new Set(options?.skipRequired ?? []);
  const overrides = options?.files ?? {};

  for (const file of REQUIRED_WORKSPACE_FILES) {
    if (skip.has(file)) continue;
    const content = overrides[file] ?? DEFAULT_CONTENT[file] ?? `# ${file}\n`;
    await writeFile(path.join(basePath, file), content, 'utf8');
  }

  for (const [filename, content] of Object.entries(overrides)) {
    if (REQUIRED_WORKSPACE_FILES.includes(filename as (typeof REQUIRED_WORKSPACE_FILES)[number])) {
      continue;
    }
    await writeFile(path.join(basePath, filename), content, 'utf8');
  }

  if (options?.extraFiles) {
    for (const [filename, content] of Object.entries(options.extraFiles)) {
      const filePath = path.join(basePath, filename);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }
  }

  if (options?.createSkillsDir) {
    await mkdir(path.join(basePath, 'skills', 'placeholder'), { recursive: true });
  }

  if (options?.createMemoryDir || options?.memoryFiles) {
    await mkdir(path.join(basePath, 'memory'), { recursive: true });
    for (const [filename, content] of Object.entries(options?.memoryFiles ?? {})) {
      await writeFile(path.join(basePath, 'memory', filename), content, 'utf8');
    }
  }

  if (options?.symlinks) {
    for (const [linkName, target] of Object.entries(options.symlinks)) {
      const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(basePath, target);
      await symlink(resolvedTarget, path.join(basePath, linkName));
    }
  }

  return basePath;
}

export async function cleanupTempWorkspace(basePath: string): Promise<void> {
  await rm(basePath, { recursive: true, force: true });
}
