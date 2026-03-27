import path from 'node:path';
import type { Command } from 'commander';
import { executeImport } from '../core/import-exec';
import { planImport } from '../core/import-plan';
import { discoverOpenClawConfig } from '../core/openclaw-config';
import { cleanupTempDir, readPackage } from '../core/package-read';
import type { BlockedImportPlan, ExecutableImportPlan } from '../core/types';
import { type RenderableCliError, renderableCliErrorBrand } from '../renderable-cli-error';
import { pushSection } from '../utils/output';

interface ImportOptions {
  targetWorkspace: string;
  agentId?: string;
  targetAgentDir?: string;
  config?: string;
  force?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

interface BlockedImportReport
  extends Pick<
    BlockedImportPlan,
    'failed' | 'requiredInputs' | 'warnings' | 'nextSteps' | 'writePlan'
  > {
  status: 'blocked';
}

interface DryRunImportReport
  extends Pick<ExecutableImportPlan, 'warnings' | 'nextSteps' | 'writePlan'> {
  status: 'dry-run';
}

class ImportBlockedError extends Error implements RenderableCliError {
  readonly [renderableCliErrorBrand] = true;

  constructor(
    readonly report: BlockedImportReport,
    private readonly asJson: boolean,
  ) {
    super(formatBlockedImportReport(report));
    this.name = 'ImportBlockedError';
  }

  render(): string {
    return this.asJson ? JSON.stringify(this.report, null, 2) : this.message;
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

  if (summary.runtimeFileCount > 0) {
    lines.push(`- runtime files: ${summary.runtimeFileCount}`);
  }

  if (report.writePlan.runtimePlan) {
    lines.push(`- target agentDir: ${report.writePlan.runtimePlan.targetAgentDir}`);
  }

  if (summary.runtimeCollisions) {
    lines.push('- runtime collisions detected: yes');
  }

  return lines.join('\n');
}

function formatDryRunImportReport(report: DryRunImportReport): string {
  const { summary } = report.writePlan;
  const lines = ['Import dry run'];

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

  if (summary.runtimeFileCount > 0) {
    lines.push(`- runtime files: ${summary.runtimeFileCount}`);
  }

  if (report.writePlan.runtimePlan) {
    lines.push(`- target agentDir: ${report.writePlan.runtimePlan.targetAgentDir}`);
    if (report.writePlan.runtimePlan.pathRewrites.length > 0) {
      lines.push(`- path rewrites: ${report.writePlan.runtimePlan.pathRewrites.length}`);
    }
  }

  if (summary.runtimeCollisions) {
    lines.push('- runtime collisions detected: yes');
  }

  return lines.join('\n');
}

export async function runImport(packagePath: string, options: ImportOptions): Promise<void> {
  if (!packagePath || !options.targetWorkspace) {
    throw new Error('import requires <package-path> and --target-workspace <path>');
  }

  let tempDir: string | undefined;

  try {
    const pkg = await readPackage(path.resolve(packagePath), {
      onTempDir(dir) {
        tempDir = dir;
      },
    });

    const configPath = options.config
      ? path.resolve(options.config)
      : (
          await discoverOpenClawConfig({ cwd: path.resolve(options.targetWorkspace) }).catch(
            () => undefined,
          )
        )?.configPath;

    const plan = await planImport({
      pkg,
      targetWorkspacePath: path.resolve(options.targetWorkspace),
      targetAgentId: options.agentId,
      targetConfigPath: configPath,
      targetAgentDir: options.targetAgentDir,
      force: options.force,
    });

    if (!plan.canProceed) {
      throw new ImportBlockedError(
        {
          status: 'blocked',
          failed: plan.failed,
          requiredInputs: plan.requiredInputs,
          warnings: plan.warnings,
          nextSteps: plan.nextSteps,
          writePlan: plan.writePlan,
        },
        options.json === true,
      );
    }

    if (options.dryRun) {
      const report: DryRunImportReport = {
        status: 'dry-run',
        warnings: plan.warnings,
        nextSteps: plan.nextSteps,
        writePlan: plan.writePlan,
      };
      console.log(
        options.json ? JSON.stringify(report, null, 2) : formatDryRunImportReport(report),
      );
      return;
    }

    const result = await executeImport({ pkg, plan });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const lines = [
      'Import complete',
      `  Workspace: ${result.targetWorkspacePath}`,
      `  Agent id: ${result.agentId}`,
      `  Imported files: ${result.importedFiles.length}`,
      `  Metadata files: ${result.metadataFiles.length}`,
    ];

    if (result.importedRuntimeFiles.length > 0) {
      lines.push(`  Runtime files: ${result.importedRuntimeFiles.length}`);
    }
    if (result.targetAgentDir) {
      lines.push(`  Agent dir: ${result.targetAgentDir}`);
    }

    pushSection(lines, 'Warnings', result.warnings);
    pushSection(lines, 'Next steps', result.nextSteps);

    console.log(lines.join('\n'));
  } finally {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  }
}

export function registerImportCommand(command: Command): void {
  command
    .description('Import a portable .ocpkg directory into a target workspace. If the package includes a runtime layer, runtime files are restored to the target agentDir.')
    .argument('<package-path>', 'Portable package directory path')
    .requiredOption('--target-workspace <path>', 'Target workspace path')
    .option('--agent-id <id>', 'Target agent id override')
    .option('--target-agent-dir <path>', 'Target agentDir for runtime file import. Required when the package includes a runtime layer and no agentDir is discoverable from config.')
    .option('--config <path>', 'Target OpenClaw config path')
    .option('--force', 'Overwrite existing workspace files and runtime files in-place (does not remove unrelated files)')
    .option('--dry-run', 'Print the import plan (including runtime details) and exit without writing files')
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runImport);
}
