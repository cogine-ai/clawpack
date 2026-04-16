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

  const runtimeMode = normalizeRuntimeMode(options.runtimeMode) ?? 'default';
  const workspacePath = path.resolve(options.workspace);
  const scan = await scanWorkspace(workspacePath);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(workspacePath, {
    configPath: options.config,
    agentId: options.agentId,
  });

  const warnings = [
    'Skill topology is snapshot-only; host-bound and reinstall-required skills must be reinstalled or reconfigured on the target host.',
  ];

  let runtimeResult: RuntimeScanResult | undefined;
  if (runtimeMode !== 'none') {
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
    runtimeMode,
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
      artifacts: runtimeResult.artifacts,
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
    `Skill allowlist: ${skills.allowlist.mode === 'allowlist' ? `${skills.allowlist.values.join(', ') || 'none'} [${skills.allowlist.source}]` : 'unrestricted'}`,
    `Skill roots (${skills.roots.length}): ${skills.roots.map((root) => `${root.kind}${root.exists ? '' : ' (missing)'}`).join(', ') || 'none'}`,
    `Visible skills (${skills.effectiveSkills.filter((skill) => skill.status === 'visible').length}): ${skills.effectiveSkills.filter((skill) => skill.status === 'visible').map((skill) => `${skill.skillKey} [${skill.portability}]`).join(', ') || 'none'}`,
    `Skill notes: ${skills.notes.join(' | ') || 'none'}`,
    `Warnings: ${warnings.join(' | ') || 'none'}`,
    `Runtime mode: ${report.runtimeMode}`,
  ];

  if (report.portableConfig.notes.length > 0) {
    lines.push(`Portable config notes: ${report.portableConfig.notes.join(' | ')}`);
  }

  if (runtimeResult) {
    lines.push('Runtime contract: grounded=source-backed, inferred=convenience-only, unsupported=not packaged');
    lines.push(`Runtime agentDir: ${runtimeResult.agentDir}`);
    lines.push(`Runtime included files (${runtimeResult.includedFiles.length}): ${runtimeResult.includedFiles.map(f => f.relativePath).join(', ') || 'none'}`);
    lines.push(`Runtime grounded files (${runtimeResult.artifacts.grounded.length}): ${runtimeResult.artifacts.grounded.join(', ') || 'none'}`);
    lines.push(`Runtime inferred files (${runtimeResult.artifacts.inferred.length}): ${runtimeResult.artifacts.inferred.join(', ') || 'none'}`);
    lines.push(`Runtime unsupported files (${runtimeResult.artifacts.unsupported.length}): ${runtimeResult.artifacts.unsupported.join(', ') || 'none'}`);
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
    .option(
      '--runtime-mode <mode>',
      'Runtime layer mode: none (skip), default (grounded source-backed runtime artifacts only), or full (adds inferred convenience files). Unsupported skills/extensions are never packaged. Defaults to "default" when omitted. Auth and session files are always excluded.',
    )
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runInspect);
}
