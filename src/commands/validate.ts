import path from 'node:path';
import type { Command } from 'commander';
import { validateImportedWorkspace } from '../core/validate';

interface ValidateOptions {
  targetWorkspace: string;
  agentId?: string;
  config?: string;
}

export async function runValidate(options: ValidateOptions): Promise<void> {
  if (!options.targetWorkspace) {
    throw new Error('validate requires --target-workspace <path>');
  }

  const report = await validateImportedWorkspace({
    targetWorkspacePath: path.resolve(options.targetWorkspace),
    agentId: options.agentId,
    targetConfigPath: options.config ? path.resolve(options.config) : undefined,
  });

  console.log(JSON.stringify(report, null, 2));
}

export function registerValidateCommand(command: Command): void {
  command
    .description('Validate an imported workspace and optional config wiring.')
    .requiredOption('--target-workspace <path>', 'Imported target workspace path')
    .option('--agent-id <id>', 'Expected target agent id')
    .option('--config <path>', 'Target OpenClaw config path for consistency checks')
    .action(runValidate);
}
