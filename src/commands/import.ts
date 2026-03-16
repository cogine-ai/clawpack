import path from 'node:path';
import type { Command } from 'commander';
import { executeImport } from '../core/import-exec';
import { discoverOpenClawConfig } from '../core/openclaw-config';
import { planImport } from '../core/import-plan';
import { readPackageDirectory } from '../core/package-read';

interface ImportOptions {
  targetWorkspace: string;
  agentId?: string;
  config?: string;
  force?: boolean;
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
    throw new Error(JSON.stringify({
      status: 'blocked',
      failed: plan.failed,
      requiredInputs: plan.requiredInputs,
      warnings: plan.warnings,
      nextSteps: plan.nextSteps,
      writePlan: plan.writePlan,
    }, null, 2));
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
    .action(runImport);
}
