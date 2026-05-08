import path from 'node:path';
import { pathExists } from '../utils/fs';
import { readJsonFile } from '../utils/json';
import { checksumFile } from './checksums';
import {
  buildManualCompatibility,
  buildUnsupportedCompatibility,
  mergeCompatibilityEntries,
} from './compatibility';
import { OPTIONAL_WORKSPACE_FILES, REQUIRED_WORKSPACE_FILES } from './constants';
import {
  loadOpenClawConfig,
  resolveAgentFromConfig,
  resolveEffectiveAgentDir,
  resolveEffectiveWorkspace,
} from './openclaw-config';
import type { ValidationReport } from './types';

const AUTH_FILES = ['auth.json', 'auth-profiles.json'];

type ImportResultMetadata = {
  importedRuntimeFiles?: string[];
  expectedChecksums?: Record<string, string>;
};

export async function validateImportedWorkspace(params: {
  targetWorkspacePath: string;
  agentId?: string;
  targetConfigPath?: string;
  targetAgentDir?: string;
}): Promise<ValidationReport> {
  const targetWorkspacePath = path.resolve(params.targetWorkspacePath);
  const report: ValidationReport = {
    passed: [],
    warnings: [],
    failed: [],
    nextSteps: [],
  };

  if (await pathExists(targetWorkspacePath)) {
    report.passed.push(`Workspace exists: ${targetWorkspacePath}`);
  } else {
    report.failed.push(`Workspace is missing: ${targetWorkspacePath}`);
    assignCompatibility(report);
    return report;
  }

  for (const file of REQUIRED_WORKSPACE_FILES) {
    if (await pathExists(path.join(targetWorkspacePath, file))) {
      report.passed.push(`Workspace file present: ${file}`);
    } else {
      report.failed.push(`Missing required workspace file: ${file}`);
    }
  }

  for (const file of OPTIONAL_WORKSPACE_FILES) {
    if (await pathExists(path.join(targetWorkspacePath, file))) {
      report.passed.push(`Optional workspace file present: ${file}`);
    }
  }

  const metadataDirectory = path.join(targetWorkspacePath, '.openclaw-agent-package');
  const agentRecordPath = path.join(metadataDirectory, 'agent-definition.json');
  const importResultPath = path.join(metadataDirectory, 'import-result.json');
  let metadataAgentDir: string | undefined;
  let importResultRecord: ImportResultMetadata | undefined;

  if (await pathExists(agentRecordPath)) {
    const agentRecord = await readJsonFile<{
      agentId?: string;
      targetAgentDir?: string | null;
    }>(agentRecordPath);
    if (!params.agentId || agentRecord.agentId === params.agentId) {
      report.passed.push(`Portable agent definition record present: ${agentRecordPath}`);
    } else {
      report.failed.push(
        `Imported agent record id mismatch: expected ${params.agentId}, got ${agentRecord.agentId ?? 'unknown'}`,
      );
    }
    if (agentRecord.targetAgentDir) {
      metadataAgentDir = agentRecord.targetAgentDir;
    }
  } else {
    report.failed.push(`Missing imported agent definition record: ${agentRecordPath}`);
  }

  try {
    importResultRecord = await readJsonFile<ImportResultMetadata>(importResultPath);
  } catch {
    // Best-effort: older or partial imports may not have valid import-result metadata.
  }

  await validateExpectedChecksums(report, {
    rootPath: targetWorkspacePath,
    expectedChecksums: importResultRecord?.expectedChecksums,
    keyPrefix: 'workspace/',
    failOnMissingFiles: true,
  });

  if (params.targetConfigPath) {
    const { configPath, config } = await loadOpenClawConfig({
      configPath: params.targetConfigPath,
    });
    if (!params.agentId) {
      report.warnings.push(
        `OpenClaw config consistency check skipped for ${configPath} because --agent-id was not provided.`,
      );
    } else {
      const resolved = resolveAgentFromConfig(config, params.agentId);
      if (!resolved) {
        report.failed.push(`OpenClaw config agent missing: ${params.agentId} (${configPath})`);
        report.nextSteps.push(
          'Re-run import with --config or add the target agent entry manually to the OpenClaw config.',
        );
      } else {
        report.passed.push(`OpenClaw config agent present: ${params.agentId} (${configPath})`);
        const resolvedConfigWorkspace = resolveEffectiveWorkspace(config, configPath, params.agentId);
        if (!resolvedConfigWorkspace) {
          report.failed.push(
            `OpenClaw config agent workspace missing: ${params.agentId} (${configPath})`,
          );
        } else if (resolvedConfigWorkspace === targetWorkspacePath) {
          report.passed.push(
            `OpenClaw config workspace matches imported workspace: ${resolvedConfigWorkspace}`,
          );
        } else {
          report.failed.push(
            `OpenClaw config workspace mismatch for ${params.agentId}: expected ${targetWorkspacePath}, got ${resolvedConfigWorkspace}`,
          );
        }
      }
    }
  }

  const resolvedAgentDir = params.targetAgentDir
    ? path.resolve(params.targetAgentDir)
    : metadataAgentDir
      ? path.resolve(metadataAgentDir)
      : undefined;

  if (resolvedAgentDir) {
    await validateRuntimeLayer(report, {
      targetAgentDir: resolvedAgentDir,
      agentId: params.agentId,
      targetConfigPath: params.targetConfigPath,
      metadataDirectory,
      importResultRecord,
    });
  }

  report.warnings.push(
    'Skill topology is snapshot-only; host-bound and reinstall-required skills must be reinstalled or reconfigured on the target host.',
  );
  report.nextSteps.push(
    'This clawpacker version does not restore live bindings or scheduled jobs; review meta/binding-hints.json if present and reconfigure any channel routing and cron entries manually on the target instance.',
  );
  report.nextSteps.push('Run `openclaw doctor` and manually verify provider/model availability after import.');
  report.nextSteps.push(
    'Review imported USER.md and TOOLS.md, plus MEMORY.md if present, for target-specific adjustments.',
  );
  assignCompatibility(report);

  return report;
}

async function validateRuntimeLayer(
  report: ValidationReport,
  params: {
    targetAgentDir: string;
    agentId?: string;
    targetConfigPath?: string;
    metadataDirectory: string;
    importResultRecord?: ImportResultMetadata;
  },
): Promise<void> {
  const { targetAgentDir } = params;

  if (await pathExists(targetAgentDir)) {
    report.passed.push(`Runtime agentDir exists: ${targetAgentDir}`);
  } else {
    report.failed.push(`Runtime agentDir is missing: ${targetAgentDir}`);
    return;
  }

  if (params.targetConfigPath && params.agentId) {
    try {
      const { config, configPath } = await loadOpenClawConfig({
        configPath: params.targetConfigPath,
      });
      const resolved = resolveAgentFromConfig(config, params.agentId);
      if (resolved) {
        const configAgentDir = resolveEffectiveAgentDir(config, configPath, params.agentId);
        if (configAgentDir === targetAgentDir) {
          report.passed.push(`OpenClaw config agentDir matches target: ${configAgentDir}`);
        } else if (configAgentDir) {
          report.failed.push(
            `OpenClaw config agentDir mismatch: expected ${targetAgentDir}, got ${configAgentDir}`,
          );
        } else {
          report.failed.push(
            `OpenClaw config agent ${params.agentId} is missing agentDir field.`,
          );
        }
      }
    } catch {
      report.warnings.push('Could not validate agentDir against OpenClaw config.');
    }
  }

  for (const authFile of AUTH_FILES) {
    const authPath = path.join(targetAgentDir, authFile);
    if (await pathExists(authPath)) {
      report.warnings.push(
        `Auth file present in target agentDir — verify it is local state and not imported: ${authFile}`,
      );
    } else {
      report.passed.push(`Excluded auth file correctly absent: ${authFile}`);
    }
  }

  const agentRecordPath = path.join(params.metadataDirectory, 'agent-definition.json');
  let expectedRuntimeFiles: string[] | undefined;
  try {
    const record = await readJsonFile<{
      targetAgentDir?: string | null;
    }>(agentRecordPath);

    if (record.targetAgentDir && path.resolve(record.targetAgentDir) !== targetAgentDir) {
      report.warnings.push(
        `Import metadata records a different agentDir than the one being validated: ${record.targetAgentDir}`,
      );
    }
  } catch {}

  expectedRuntimeFiles = params.importResultRecord?.importedRuntimeFiles;
  if (!expectedRuntimeFiles || expectedRuntimeFiles.length === 0) {
    expectedRuntimeFiles = getExpectedFilesFromChecksums(
      params.importResultRecord?.expectedChecksums,
      'runtime/files/',
    );
  }

  if (expectedRuntimeFiles && expectedRuntimeFiles.length > 0) {
    for (const relPath of expectedRuntimeFiles) {
      const filePath = path.join(targetAgentDir, relPath);
      if (await pathExists(filePath)) {
        report.passed.push(`Runtime file present: ${relPath}`);
      } else {
        report.failed.push(`Missing expected runtime file: ${relPath}`);
      }
    }
  } else {
    report.warnings.push(
      'Could not determine expected runtime files from import metadata — skipping file presence checks.',
    );
  }

  await validateExpectedChecksums(report, {
    rootPath: targetAgentDir,
    expectedChecksums: params.importResultRecord?.expectedChecksums,
    keyPrefix: 'runtime/files/',
    failOnMissingFiles: false,
  });

  const settingsPath = path.join(targetAgentDir, 'settings.json');
  if (await pathExists(settingsPath)) {
    try {
      const raw = await readJsonFile<Record<string, unknown>>(settingsPath);
      if (typeof raw === 'object' && raw !== null) {
        report.passed.push('Runtime settings.json is valid JSON.');
      }
    } catch {
      report.failed.push('Runtime settings.json exists but is not valid JSON.');
    }
  }

  const modelsPath = path.join(targetAgentDir, 'models.json');
  if (expectedRuntimeFiles?.includes('models.json')) {
    if (await pathExists(modelsPath)) {
      report.passed.push('Sanitized models.json present (was included in package).');
    } else {
      report.failed.push('Expected sanitized models.json is missing.');
    }
  }
}

async function validateExpectedChecksums(
  report: ValidationReport,
  params: {
    rootPath: string;
    expectedChecksums?: Record<string, string>;
    keyPrefix: 'workspace/' | 'runtime/files/';
    failOnMissingFiles: boolean;
  },
): Promise<void> {
  const entries = Object.entries(params.expectedChecksums ?? {}).filter(([key]) =>
    key.startsWith(params.keyPrefix),
  );

  if (entries.length === 0) {
    report.warnings.push(
      `Could not determine expected checksums for ${params.keyPrefix === 'workspace/' ? 'workspace' : 'runtime'} files — skipping checksum validation.`,
    );
    return;
  }

  for (const [key, expectedChecksum] of entries) {
    const relativePath = key.slice(params.keyPrefix.length);
    const filePath = path.join(params.rootPath, relativePath);
    if (!(await pathExists(filePath))) {
      if (params.failOnMissingFiles) {
        report.failed.push(`Missing imported file: ${key}`);
      }
      continue;
    }

    let actualChecksum: string;
    try {
      actualChecksum = await checksumFile(filePath);
    } catch (err) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        if (params.failOnMissingFiles) {
          report.failed.push(`Missing imported file: ${key}`);
        }
        continue;
      }
      throw err;
    }
    if (actualChecksum === expectedChecksum) {
      report.passed.push(`Checksum OK: ${key}`);
    } else {
      report.failed.push(`Checksum mismatch: ${key}`);
    }
  }
}

function getExpectedFilesFromChecksums(
  expectedChecksums: Record<string, string> | undefined,
  keyPrefix: 'workspace/' | 'runtime/files/',
): string[] {
  return Object.keys(expectedChecksums ?? {})
    .filter((key) => key.startsWith(keyPrefix))
    .map((key) => key.slice(keyPrefix.length))
    .sort((a, b) => a.localeCompare(b));
}

function assignCompatibility(report: ValidationReport): void {
  report.compatibility = mergeCompatibilityEntries(
    buildUnsupportedCompatibility([
      'Skill implementations are manifest-only and are not restored by validation.',
      'Live bindings and scheduled jobs are not restored by clawpacker.',
    ]),
    buildManualCompatibility([
      ...report.warnings,
      ...report.nextSteps,
    ]),
  );
}
