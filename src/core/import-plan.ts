import { access } from 'node:fs/promises';
import path from 'node:path';
import type { ImportHints, ImportPlan, ReadPackageResult } from './types';
import { loadOpenClawConfig } from './openclaw-config';

export async function planImport(params: {
  pkg: ReadPackageResult;
  targetWorkspacePath?: string;
  targetAgentId?: string;
  targetConfigPath?: string;
  force?: boolean;
}): Promise<ImportPlan> {
  const requiredInputs: ImportHints['requiredInputs'] = [];
  const failed: string[] = [];
  const warnings = [...params.pkg.importHints.warnings];
  const nextSteps = [
    'Channel bindings are not restored automatically in v1.',
    'Review the imported identity and memory files before using the agent.',
  ];

  if (!params.targetWorkspacePath) {
    requiredInputs.push({ key: 'targetWorkspacePath', reason: 'A target workspace path is required for import.' });
  }
  if (!params.targetAgentId) {
    requiredInputs.push({ key: 'agentId', reason: 'Choose a target agent id for the imported definition.' });
  }

  const targetWorkspacePath = path.resolve(
    params.targetWorkspacePath ?? params.pkg.agentDefinition.agent.workspace.suggestedBasename,
  );
  const targetAgentId = params.targetAgentId ?? params.pkg.agentDefinition.agent.suggestedId;

  const workspaceExists = await pathExists(targetWorkspacePath);
  if (workspaceExists && !params.force) {
    failed.push(`Target workspace already exists: ${targetWorkspacePath}`);
    nextSteps.push('Choose a different --target-workspace path or re-run with --force to overwrite the existing workspace.');
  } else if (workspaceExists) {
    warnings.push(`Target workspace exists and will be overwritten because --force was provided: ${targetWorkspacePath}`);
  }

  let configAgentCollision = false;
  if (!params.targetConfigPath) {
    warnings.push('OpenClaw config not found; agent definition will only be recorded in local import metadata.');
  } else if (await pathExists(params.targetConfigPath)) {
    const { config } = await loadOpenClawConfig({ configPath: params.targetConfigPath });
    if (config.agents?.[targetAgentId]) {
      configAgentCollision = true;
      if (!params.force) {
        failed.push(`Target agent already exists in OpenClaw config: ${targetAgentId}`);
        nextSteps.push('Choose a different --agent-id or re-run with --force to update the existing OpenClaw config entry.');
      } else {
        warnings.push(`OpenClaw config already contains agent ${targetAgentId}; it will be overwritten because --force was provided.`);
      }
    }
  } else {
    warnings.push(`Target OpenClaw config does not exist yet and will be created during import: ${params.targetConfigPath}`);
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
    summary: {
      fileCount: params.pkg.workspaceFiles.length,
      existingWorkspaceDetected: workspaceExists,
      targetConfigDetected: Boolean(params.targetConfigPath),
      configAgentCollision,
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

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
