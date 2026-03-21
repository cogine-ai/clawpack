import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  RUNTIME_ALLOWLIST_DEFAULT,
  RUNTIME_ALLOWLIST_FULL_EXTRA,
  RUNTIME_ALWAYS_EXCLUDE,
  RUNTIME_EXCLUDE_EXTENSIONS,
} from './constants';
import { sanitizeModelsJson } from './models-sanitize';
import { analyzeSettingsJson } from './settings-analysis';
import type { ExcludedWorkspaceFile, RuntimeMode, RuntimeScanResult, SettingsAnalysis } from './types';

export async function scanRuntime(params: {
  mode: RuntimeMode;
  agentDir: string;
  workspacePath: string;
}): Promise<RuntimeScanResult> {
  const { mode, agentDir, workspacePath } = params;

  if (mode === 'none') {
    return {
      mode,
      agentDir,
      includedFiles: [],
      excludedFiles: [],
      warnings: [],
      sanitizedModels: undefined,
      settingsAnalysis: undefined,
    };
  }

  const dirExists = await isDirectory(agentDir);
  if (!dirExists) {
    return {
      mode,
      agentDir,
      includedFiles: [],
      excludedFiles: [],
      warnings: [`agentDir does not exist or is not a directory: ${agentDir}`],
      sanitizedModels: undefined,
      settingsAnalysis: undefined,
    };
  }

  const allowlist = mode === 'full'
    ? [...RUNTIME_ALLOWLIST_DEFAULT, ...RUNTIME_ALLOWLIST_FULL_EXTRA]
    : [...RUNTIME_ALLOWLIST_DEFAULT];

  const includedFiles: Array<{ relativePath: string; absolutePath: string }> = [];
  const excludedFiles: ExcludedWorkspaceFile[] = [];
  const warnings: string[] = [];
  const allFiles = await collectFiles(agentDir, '', warnings);

  for (const relativePath of allFiles) {
    const absolutePath = path.join(agentDir, relativePath);

    if (isAlwaysExcluded(relativePath)) {
      excludedFiles.push({ relativePath, reason: 'Always excluded: secrets/caches' });
      continue;
    }

    if (isExcludedByExtension(relativePath)) {
      excludedFiles.push({ relativePath, reason: 'Excluded: temporary/cache file' });
      continue;
    }

    if (relativePath === 'models.json') {
      continue;
    }

    if (matchesAllowlist(relativePath, allowlist)) {
      includedFiles.push({ relativePath, absolutePath });
      continue;
    }

    if (mode !== 'full' && matchesAllowlist(relativePath, RUNTIME_ALLOWLIST_FULL_EXTRA)) {
      excludedFiles.push({ relativePath, reason: 'Excluded: requires full mode' });
    }
  }

  let sanitizedModels: Record<string, unknown> | undefined;
  const modelsPath = path.join(agentDir, 'models.json');
  if (allFiles.includes('models.json') && matchesAllowlist('models.json', allowlist)) {
    try {
      const raw = await readFile(modelsPath, 'utf8');
      const parsed = JSON.parse(raw);
      const result = sanitizeModelsJson(parsed);
      sanitizedModels = result.sanitized;
      warnings.push(...result.warnings);
      if (result.sanitized) {
        includedFiles.push({ relativePath: 'models.json', absolutePath: modelsPath });
      } else {
        excludedFiles.push({ relativePath: 'models.json', reason: 'Excluded: sanitized content was empty' });
      }
    } catch {
      warnings.push('models.json could not be parsed — skipped.');
      excludedFiles.push({ relativePath: 'models.json', reason: 'Excluded: could not parse models.json' });
    }
  }

  let settingsAnalysis: SettingsAnalysis | undefined;
  const settingsFile = includedFiles.find(f => f.relativePath === 'settings.json');
  if (settingsFile) {
    try {
      const raw = await readFile(settingsFile.absolutePath, 'utf8');
      const parsed = JSON.parse(raw);
      settingsAnalysis = analyzeSettingsJson(parsed, { workspacePath, agentDir });
    } catch {
      warnings.push('settings.json could not be parsed for path analysis.');
    }
  }

  return {
    mode,
    agentDir,
    includedFiles,
    excludedFiles,
    warnings,
    sanitizedModels,
    settingsAnalysis,
  };
}

async function collectFiles(dir: string, prefix = '', warnings: string[] = []): Promise<string[]> {
  const files: string[] = [];
  let entries: string[];
  try {
    entries = (await readdir(dir)).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    warnings.push(`Could not read runtime path ${dir}: ${String(error)}`);
    return files;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const relativePath = prefix ? `${prefix}/${entry}` : entry;

    try {
      const entryStat = await lstat(fullPath);

      if (entryStat.isSymbolicLink()) {
        continue;
      }

      if (entryStat.isDirectory()) {
        const subFiles = await collectFiles(fullPath, relativePath, warnings);
        files.push(...subFiles);
      } else if (entryStat.isFile()) {
        files.push(relativePath);
      }
    } catch (error) {
      warnings.push(`Could not inspect runtime path ${fullPath}: ${String(error)}`);
      continue;
    }
  }

  return files;
}

function matchesAllowlist(relativePath: string, allowlist: string[]): boolean {
  for (const pattern of allowlist) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (relativePath.startsWith(`${prefix}/`)) return true;
    } else if (pattern === relativePath) {
      return true;
    }
  }
  return false;
}

function isAlwaysExcluded(relativePath: string): boolean {
  for (const pattern of RUNTIME_ALWAYS_EXCLUDE) {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      if (relativePath.startsWith(`${prefix}/`)) return true;
    } else if (relativePath === pattern) {
      return true;
    }
  }
  return false;
}

function isExcludedByExtension(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return RUNTIME_EXCLUDE_EXTENSIONS.includes(ext);
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const s = await lstat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}
