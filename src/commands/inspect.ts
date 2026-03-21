import path from 'node:path';
import type { Command } from 'commander';
import { extractAgentDefinition } from '../core/agent-extract';
import { resolveAgentDir } from '../core/openclaw-config';
import { normalizeRuntimeMode } from '../core/runtime-mode';
import { scanRuntime } from '../core/runtime-scan';
import { detectSkills } from '../core/skills-detect';
import type { RuntimeScanResult } from '../core/types';
import { scanWorkspace } from '../core/workspace-scan';

interface InspectOptions {
  workspace: string;
  config?: string;
  agentId?: string;
  json?: boolean;
  runtimeMode?: string;
}

export async function runInspect(options: InspectOptions): Promise<void> {
  if (!options.workspace) {
    throw new Error('inspect requires --workspace <path>');
  }

  const runtimeMode = normalizeRuntimeMode(options.runtimeMode);
  const workspacePath = path.resolve(options.workspace);
  const scan = await scanWorkspace(workspacePath);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(workspacePath, {
    configPath: options.config,
    agentId: options.agentId,
  });

  const warnings = [
    'Skills are manifest-only and may require manual installation.',
  ];

  let runtimeResult: RuntimeScanResult | undefined;
  if (runtimeMode && runtimeMode !== 'none') {
    const agentDir = await resolveAgentDir({
      configPath: options.config,
      workspacePath,
      agentId: options.agentId,
    });

    if (agentDir) {
      runtimeResult = await scanRuntime({
        mode: runtimeMode,
        agentDir,
        workspacePath,
      });
    } else {
      warnings.push('Could not resolve agentDir from OpenClaw config — runtime layer skipped.');
    }
  }

  const bootstrapFiles = scan.includedFiles
    .filter((f) => f.isBootstrap)
    .map((f) => f.relativePath);

  const report = {
    workspacePath,
    includedFiles: scan.includedFiles.map((file) => file.relativePath),
    bootstrapFiles,
    excludedFiles: scan.excludedFiles,
    portableConfig: {
      found: !agentDefinition.notes.some((note) => note.includes('placeholder')),
      agent: agentDefinition.agent,
      fieldClassification: agentDefinition.fieldClassification,
      notes: agentDefinition.notes,
    },
    skills,
    runtime: runtimeResult ? {
      mode: runtimeResult.mode,
      agentDir: runtimeResult.agentDir,
      includedFiles: runtimeResult.includedFiles.map(f => f.relativePath),
      excludedFiles: runtimeResult.excludedFiles,
      warnings: runtimeResult.warnings,
    } : undefined,
    warnings,
    errors: [],
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [
    `Workspace: ${report.workspacePath}`,
    `Included files (${report.includedFiles.length}): ${report.includedFiles.join(', ') || 'none'}`,
    `Bootstrap files (${report.bootstrapFiles.length}): ${report.bootstrapFiles.join(', ') || 'none'}`,
    `Excluded files (${report.excludedFiles.length}): ${report.excludedFiles.map((entry) => `${entry.relativePath} [${entry.reason}]`).join(', ') || 'none'}`,
    'Portable agent definition:',
    `  found: ${report.portableConfig.found ? 'yes' : 'no'}`,
    `  suggested id: ${report.portableConfig.agent.suggestedId}`,
    `  suggested name: ${report.portableConfig.agent.suggestedName}`,
    `  workspace basename: ${report.portableConfig.agent.workspace.suggestedBasename}`,
    `  identity name: ${report.portableConfig.agent.identity.name}`,
    `  default model: ${report.portableConfig.agent.model?.default ?? 'not set'}`,
    `  portable fields: ${Object.entries(report.portableConfig.fieldClassification)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
    `Skills (workspace): ${skills.workspaceSkills.join(', ') || 'none'}`,
    `Skills (referenced): ${skills.referencedSkills.join(', ') || 'none'}`,
    `Skill notes: ${skills.notes.join(' | ') || 'none'}`,
    `Warnings: ${warnings.join(' | ') || 'none'}`,
  ];

  if (report.portableConfig.notes.length > 0) {
    lines.push(`Portable config notes: ${report.portableConfig.notes.join(' | ')}`);
  }

  if (runtimeResult) {
    lines.push(`Runtime mode: ${runtimeResult.mode}`);
    lines.push(`Runtime agentDir: ${runtimeResult.agentDir}`);
    lines.push(`Runtime included files (${runtimeResult.includedFiles.length}): ${runtimeResult.includedFiles.map(f => f.relativePath).join(', ') || 'none'}`);
    lines.push(`Runtime excluded files (${runtimeResult.excludedFiles.length}): ${runtimeResult.excludedFiles.map(f => `${f.relativePath} [${f.reason}]`).join(', ') || 'none'}`);
    if (runtimeResult.warnings.length > 0) {
      lines.push(`Runtime warnings: ${runtimeResult.warnings.join(' | ')}`);
    }
  }

  console.log(lines.join('\n'));
}

export function registerInspectCommand(command: Command): void {
  command
    .description('Inspect a workspace and report what is portable.')
    .requiredOption('--workspace <path>', 'Source workspace path')
    .option('--config <path>', 'OpenClaw config path')
    .option('--agent-id <id>', 'Source agent id override')
    .option('--runtime-mode <mode>', 'Runtime mode: none, default, or full')
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runInspect);
}
