import path from 'node:path';
import type { Command } from 'commander';
import { executeImport } from '../core/import-exec';
import { discoverOpenClawConfig } from '../core/openclaw-config';
import { planImport } from '../core/import-plan';
import { readPackageDirectory } from '../core/package-read';
import type { BlockedImportPlan, ExecutableImportPlan } from '../core/types';

interface ImportOptions {
  targetWorkspace: string;
  agentId?: string;
  config?: string;
  force?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

export interface RenderableCliError {
  render(): string;
}

interface BlockedImportReport extends Pick<
  BlockedImportPlan,
  'failed' | 'requiredInputs' | 'warnings' | 'nextSteps' | 'writePlan'
> {
  status: 'blocked';
}

interface DryRunImportReport extends Pick<ExecutableImportPlan, 'warnings' | 'nextSteps' | 'writePlan'> {
  status: 'dry-run';
}

class ImportBlockedError extends Error implements RenderableCliError {
  constructor(
    readonly report: BlockedImportReport,
    private readonly asJson: boolean,
  ) {
    super(formatBlockedImportReport(report));
    this.name = 'ImportBlockedError';
  }

  render(): string {
    return this.asJson
      ? JSON.stringify(this.report, null, 2)
      : this.message;
  }
}

function formatRequiredInputKey(key: BlockedImportReport['requiredInputs'][number]['key']): string {
  if (key === 'agentId') {
    return '--agent-id';
  }

  if (key === 'targetWorkspacePath') {
    return '--target-workspace';
  }

  return key;
}

function pushSection(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }

  lines.push('', `${heading}:`, ...items.map((item) => `- ${item}`));
}

function formatBlockedImportReport(report: BlockedImportReport): string {
  const { summary } = report.writePlan;
  const lines = ['Import blocked'];

  pushSection(lines, 'Blocked by', report.failed);
  pushSection(
    lines,
    'Required inputs',
    report.requiredInputs.map((item) => `${formatRequiredInputKey(item.key)}: ${item.reason}`),
  );
  pushSection(lines, 'Warnings', report.warnings);
  pushSection(lines, 'Next steps', report.nextSteps);

  lines.push(
    '',
    'Planned import:',
    `- target workspace: ${report.writePlan.targetWorkspacePath}`,
    `- target agent id: ${report.writePlan.targetAgentId ?? 'not set'}`,
    `- workspace files: ${summary.fileCount}`,
  );

  if (report.writePlan.targetConfigPath) {
    lines.push(`- target config: ${report.writePlan.targetConfigPath}`);
  }

  if (summary.existingWorkspaceDetected) {
    lines.push('- existing workspace detected: yes');
  }

  if (summary.configAgentCollision) {
    lines.push('- target config agent collision detected: yes');
  }

  return lines.join('\n');
}

export function isRenderableCliError(error: unknown): error is RenderableCliError {
  return typeof error === 'object'
    && error !== null
    && 'render' in error
    && typeof (error as RenderableCliError).render === 'function';
}

export async function runImport(packagePath: string, options: ImportOptions): Promise<void> {
  if (!packagePath || !options.targetWorkspace) {
    throw new Error('import requires <package-path> and --target-workspace <path>');
  }

  const pkg = await readPackageDirectory(path.resolve(packagePath));
  const configPath = options.config
    ? path.resolve(options.config)
    : (await discoverOpenClawConfig({ cwd: path.resolve(options.targetWorkspace) }).catch(() => undefined))?.configPath;

  const plan = await planImport({
    pkg,
    targetWorkspacePath: path.resolve(options.targetWorkspace),
    targetAgentId: options.agentId,
    targetConfigPath: configPath,
    force: options.force,
  });

  if (!plan.canProceed) {
    throw new ImportBlockedError({
      status: 'blocked',
      failed: plan.failed,
      requiredInputs: plan.requiredInputs,
      warnings: plan.warnings,
      nextSteps: plan.nextSteps,
      writePlan: plan.writePlan,
    }, options.json === true);
  }

  if (options.dryRun) {
    const report: DryRunImportReport = {
      status: 'dry-run',
      warnings: plan.warnings,
      nextSteps: plan.nextSteps,
      writePlan: plan.writePlan,
    };
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const result = await executeImport({ pkg, plan });
  console.log(JSON.stringify(result, null, 2));
}

export function registerImportCommand(command: Command): void {
  command
    .description('Import a portable .ocpkg directory into a target workspace.')
    .argument('<package-path>', 'Portable package directory path')
    .requiredOption('--target-workspace <path>', 'Target workspace path')
    .option('--agent-id <id>', 'Target agent id override')
    .option('--config <path>', 'Target OpenClaw config path')
    .option('--force', 'Overwrite an existing target workspace')
    .option('--dry-run', 'Print the import plan and exit without writing files')
    .option('--json', 'Emit blocked import details as JSON on failure')
    .action(runImport);
}
