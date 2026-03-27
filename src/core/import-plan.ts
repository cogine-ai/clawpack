import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathExists } from '../utils/fs';
import { RUNTIME_ALWAYS_EXCLUDE } from './constants';
import { hasAgentInConfig, loadOpenClawConfig, resolveAgentFromConfig } from './openclaw-config';
import { computePathRewrites } from './path-rewrite';
import type {
  ImportHints,
  ImportPlan,
  ReadPackageResult,
  RuntimeWritePlan,
  SettingsAnalysis,
} from './types';

export async function planImport(params: {
  pkg: ReadPackageResult;
  targetWorkspacePath?: string;
  targetAgentId?: string;
  targetConfigPath?: string;
  targetAgentDir?: string;
  force?: boolean;
}): Promise<ImportPlan> {
  const requiredInputs: ImportHints['requiredInputs'] = [];
  const failed: string[] = [];
  const warnings = [...params.pkg.importHints.warnings];
  const nextSteps = ['Review the imported identity and memory files before using the agent.'];

  if (params.pkg.bindings && params.pkg.bindings.length > 0) {
    nextSteps.push(
      'Channel bindings were included in the package. Verify channel connections on the target instance.',
    );
  } else {
    nextSteps.push(
      'Channel bindings were not included. Configure channel bindings manually on the target instance.',
    );
  }

  if (params.pkg.cronJobs && params.pkg.cronJobs.length > 0) {
    nextSteps.push(
      'Cron jobs were included in the package. Verify cron scheduling on the target instance.',
    );
  } else {
    nextSteps.push(
      'Cron jobs were not included. Create cron entries manually if scheduled tasks are needed.',
    );
  }

  if (!params.targetWorkspacePath) {
    requiredInputs.push({
      key: 'targetWorkspacePath',
      reason: 'A target workspace path is required for import.',
    });
  }
  if (!params.targetAgentId) {
    requiredInputs.push({
      key: 'agentId',
      reason: 'Choose a target agent id for the imported definition.',
    });
  }

  const targetWorkspacePath = path.resolve(
    params.targetWorkspacePath ?? params.pkg.agentDefinition.agent.workspace.suggestedBasename,
  );
  const targetAgentId = params.targetAgentId ?? params.pkg.agentDefinition.agent.suggestedId;

  const workspaceExists = await pathExists(targetWorkspacePath);
  if (workspaceExists && !params.force) {
    failed.push(`Target workspace already exists: ${targetWorkspacePath}`);
    nextSteps.push(
      'Choose a different --target-workspace path or re-run with --force to overwrite package files in-place (unrelated files are preserved).',
    );
  } else if (workspaceExists) {
    warnings.push(
      `Target workspace exists; package files will be overwritten in-place because --force was provided (unrelated files are preserved): ${targetWorkspacePath}`,
    );
  }

  let configAgentCollision = false;
  if (!params.targetConfigPath) {
    warnings.push(
      'OpenClaw config not found; agent definition will only be recorded in local import metadata.',
    );
  } else if (await pathExists(params.targetConfigPath)) {
    const { config } = await loadOpenClawConfig({ configPath: params.targetConfigPath });
    if (hasAgentInConfig(config, targetAgentId)) {
      configAgentCollision = true;
      if (!params.force) {
        failed.push(`Target agent already exists in OpenClaw config: ${targetAgentId}`);
        nextSteps.push(
          'Choose a different --agent-id or re-run with --force to update the existing OpenClaw config entry.',
        );
      } else {
        warnings.push(
          `OpenClaw config already contains agent ${targetAgentId}; it will be overwritten because --force was provided.`,
        );
      }
    }
  } else {
    warnings.push(
      `Target OpenClaw config does not exist yet and will be created during import: ${params.targetConfigPath}`,
    );
  }

  const runtimePlanResult = await planRuntimeImport({
    pkg: params.pkg,
    targetWorkspacePath,
    targetAgentId,
    targetAgentDir: params.targetAgentDir,
    targetConfigPath: params.targetConfigPath,
    force: params.force,
  });

  if (runtimePlanResult) {
    failed.push(...runtimePlanResult.failed);
    warnings.push(...runtimePlanResult.warnings);
    nextSteps.push(...runtimePlanResult.nextSteps);
  }

  const metadataDirectory = path.join(targetWorkspacePath, '.openclaw-agent-package');
  const writePlan = {
    workspaceFiles: params.pkg.workspaceFiles.map((file) => ({
      sourcePath: file.absolutePath,
      targetPath: path.join(targetWorkspacePath, file.relativePath),
      relativePath: file.relativePath,
    })),
    overwriteExisting: Boolean(params.force),
    targetWorkspacePath,
    targetAgentId,
    metadataDirectory,
    targetConfigPath: params.targetConfigPath,
    runtimePlan: runtimePlanResult?.plan,
    summary: {
      fileCount: params.pkg.workspaceFiles.length,
      existingWorkspaceDetected: workspaceExists,
      targetConfigDetected: Boolean(params.targetConfigPath),
      configAgentCollision,
      runtimeFileCount: runtimePlanResult?.plan?.files.length ?? 0,
      runtimeCollisions: runtimePlanResult?.collisions ?? false,
      targetAgentDirDetected: runtimePlanResult?.plan !== undefined,
    },
  };

  if (requiredInputs.length === 0 && failed.length === 0) {
    return {
      canProceed: true,
      requiredInputs: [],
      warnings,
      failed: [],
      nextSteps,
      writePlan,
    };
  }

  return {
    canProceed: false,
    requiredInputs,
    warnings,
    failed,
    nextSteps,
    writePlan,
  };
}

interface RuntimePlanResult {
  plan?: RuntimeWritePlan;
  failed: string[];
  warnings: string[];
  nextSteps: string[];
  collisions: boolean;
}

async function planRuntimeImport(params: {
  pkg: ReadPackageResult;
  targetWorkspacePath: string;
  targetAgentId: string;
  targetAgentDir?: string;
  targetConfigPath?: string;
  force?: boolean;
}): Promise<RuntimePlanResult | undefined> {
  const rm = params.pkg.runtimeManifest;
  if (!rm || rm.mode === 'none' || rm.includedFiles.length === 0) {
    return undefined;
  }

  const failed: string[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  const resolvedAgentDir = await resolveTargetAgentDir({
    explicit: params.targetAgentDir,
    targetAgentId: params.targetAgentId,
    targetConfigPath: params.targetConfigPath,
  });

  if (!resolvedAgentDir) {
    failed.push(
      'Runtime import requires a target agentDir but none could be resolved. ' +
        'Provide --target-agent-dir, or ensure the target agent config entry includes an agentDir field.',
    );
    return { failed, warnings, nextSteps, collisions: false };
  }

  let collisions = false;

  const otherAgentClaimsDir = await isAgentDirClaimedByOther({
    targetConfigPath: params.targetConfigPath,
    targetAgentId: params.targetAgentId,
    targetAgentDir: resolvedAgentDir,
  });

  if (otherAgentClaimsDir) {
    failed.push(
      `Target agentDir ${resolvedAgentDir} is claimed by another agent in the config. ` +
        'Choose a different --target-agent-dir or resolve the conflict manually.',
    );
    collisions = true;
  }

  const existingFiles: string[] = [];
  for (const relPath of rm.includedFiles) {
    if (isAlwaysExcludedPath(relPath)) continue;
    const targetPath = path.join(resolvedAgentDir, relPath);
    if (await pathExists(targetPath)) {
      existingFiles.push(relPath);
    }
  }

  if (existingFiles.length > 0 && !params.force) {
    collisions = true;
    failed.push(
      `${existingFiles.length} runtime file(s) already exist in target agentDir: ${existingFiles.slice(0, 5).join(', ')}` +
        (existingFiles.length > 5 ? ` (and ${existingFiles.length - 5} more)` : ''),
    );
    nextSteps.push(
      'Re-run with --force to overwrite existing runtime files, or choose a different --target-agent-dir.',
    );
  } else if (existingFiles.length > 0) {
    warnings.push(
      `${existingFiles.length} runtime file(s) will be overwritten in target agentDir because --force was provided.`,
    );
  }

  let pathRewrites: RuntimeWritePlan['pathRewrites'] = [];
  const sourceAgentDir = rm.agentDir;
  const sourceWorkspacePath = params.pkg.exportReport.workspacePath;

  const settingsAnalysisPath = path.join(
    params.pkg.packageRoot,
    'runtime',
    'settings-analysis.json',
  );
  if (await pathExists(settingsAnalysisPath)) {
    try {
      const raw = await readFile(settingsAnalysisPath, 'utf8');
      const analysis: SettingsAnalysis = JSON.parse(raw);
      const result = computePathRewrites({
        settingsAnalysis: analysis,
        sourceWorkspacePath,
        sourceAgentDir,
        targetWorkspacePath: params.targetWorkspacePath,
        targetAgentDir: resolvedAgentDir,
      });
      pathRewrites = result.rewrites;
      warnings.push(...result.warnings);

      if (result.blocked.length > 0 && !params.force) {
        collisions = true;
        failed.push(
          `${result.blocked.length} external absolute path(s) in settings.json cannot be auto-rewritten.`,
        );
        nextSteps.push('Review path references in settings.json and update manually after import.');
      }
    } catch (err) {
      warnings.push(
        `Could not parse settings-analysis.json from package — path rewrites will be skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const runtimeFilesDir = path.join(params.pkg.packageRoot, 'runtime', 'files');
  const runtimeFiles = rm.includedFiles
    .filter((relPath) => !isAlwaysExcludedPath(relPath))
    .map((relPath) => ({
      sourcePath: path.join(runtimeFilesDir, relPath),
      targetPath: path.join(resolvedAgentDir, relPath),
      relativePath: relPath,
    }));

  if (runtimeFiles.length > 0) {
    nextSteps.push(
      'Review runtime files (settings.json, prompts, themes) in the target agentDir after import.',
    );
  }

  const plan: RuntimeWritePlan = {
    files: runtimeFiles,
    targetAgentDir: resolvedAgentDir,
    sourceAgentDir,
    sourceWorkspacePath,
    pathRewrites,
    overwriteExisting: Boolean(params.force),
  };

  return { plan, failed, warnings, nextSteps, collisions };
}

async function resolveTargetAgentDir(params: {
  explicit?: string;
  targetAgentId: string;
  targetConfigPath?: string;
}): Promise<string | undefined> {
  if (params.explicit) {
    return path.resolve(params.explicit);
  }

  if (!params.targetConfigPath || !(await pathExists(params.targetConfigPath))) {
    return undefined;
  }

  try {
    const { config, configPath } = await loadOpenClawConfig({
      configPath: params.targetConfigPath,
    });
    const resolved = resolveAgentFromConfig(config, params.targetAgentId);
    if (resolved?.agent.agentDir) {
      const ad = resolved.agent.agentDir;
      return path.isAbsolute(ad) ? ad : path.resolve(path.dirname(configPath), ad);
    }
  } catch {}

  return undefined;
}

async function isAgentDirClaimedByOther(params: {
  targetConfigPath?: string;
  targetAgentId: string;
  targetAgentDir: string;
}): Promise<boolean> {
  if (!params.targetConfigPath || !(await pathExists(params.targetConfigPath))) {
    return false;
  }

  try {
    const { config, configPath } = await loadOpenClawConfig({
      configPath: params.targetConfigPath,
    });
    const entries = config.agents?.list ?? (config.agent ? [config.agent] : []);

    for (const entry of entries) {
      const entryId = entry.id ?? 'default';
      if (entryId === params.targetAgentId) continue;
      if (!entry.agentDir) continue;

      const resolved = path.isAbsolute(entry.agentDir)
        ? entry.agentDir
        : path.resolve(path.dirname(configPath), entry.agentDir);

      if (resolved === params.targetAgentDir) return true;
    }
  } catch {}

  return false;
}

function isAlwaysExcludedPath(relativePath: string): boolean {
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
