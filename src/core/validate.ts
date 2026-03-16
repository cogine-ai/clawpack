import { access } from 'node:fs/promises';
import path from 'node:path';
import { REQUIRED_WORKSPACE_FILES } from './constants';
import type { ValidationReport } from './types';
import { readJsonFile } from '../utils/json';
import { loadOpenClawConfig } from './openclaw-config';

export async function validateImportedWorkspace(params: {
  targetWorkspacePath: string;
  agentId?: string;
  targetConfigPath?: string;
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
    return report;
  }

  for (const file of REQUIRED_WORKSPACE_FILES) {
    if (await pathExists(path.join(targetWorkspacePath, file))) {
      report.passed.push(`Workspace file present: ${file}`);
    } else {
      report.failed.push(`Missing required workspace file: ${file}`);
    }
  }

  const metadataDirectory = path.join(targetWorkspacePath, '.openclaw-agent-package');
  const agentRecordPath = path.join(metadataDirectory, 'agent-definition.json');
  if (await pathExists(agentRecordPath)) {
    const agentRecord = await readJsonFile<{ agentId?: string }>(agentRecordPath);
    if (!params.agentId || agentRecord.agentId === params.agentId) {
      report.passed.push(`Portable agent definition record present: ${agentRecordPath}`);
    } else {
      report.failed.push(`Imported agent record id mismatch: expected ${params.agentId}, got ${agentRecord.agentId ?? 'unknown'}`);
    }
  } else {
    report.failed.push(`Missing imported agent definition record: ${agentRecordPath}`);
  }

  if (params.targetConfigPath) {
    const { configPath, config } = await loadOpenClawConfig({ configPath: params.targetConfigPath });
    if (!params.agentId) {
      report.warnings.push(`OpenClaw config consistency check skipped for ${configPath} because --agent-id was not provided.`);
    } else {
      const configAgent = config.agents?.[params.agentId];
      if (!configAgent) {
        report.failed.push(`OpenClaw config agent missing: ${params.agentId} (${configPath})`);
        report.nextSteps.push('Re-run import with --config or add the target agent entry manually to the OpenClaw config.');
      } else {
        report.passed.push(`OpenClaw config agent present: ${params.agentId} (${configPath})`);
        const resolvedConfigWorkspace = configAgent.workspace ? path.resolve(configAgent.workspace) : undefined;
        if (!resolvedConfigWorkspace) {
          report.failed.push(`OpenClaw config agent workspace missing: ${params.agentId} (${configPath})`);
        } else if (resolvedConfigWorkspace === targetWorkspacePath) {
          report.passed.push(`OpenClaw config workspace matches imported workspace: ${resolvedConfigWorkspace}`);
        } else {
          report.failed.push(`OpenClaw config workspace mismatch for ${params.agentId}: expected ${targetWorkspacePath}, got ${resolvedConfigWorkspace}`);
        }
      }
    }
  }

  report.warnings.push('Skills are manifest-only and may require manual installation.');
  report.nextSteps.push('Channel bindings must be configured manually on the target instance.');
  report.nextSteps.push('Review imported USER.md, TOOLS.md, and MEMORY.md for target-specific adjustments.');

  return report;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
