import path from 'node:path';
import type { Command } from 'commander';
import { validateImportedWorkspace } from '../core/validate';
import { pushSection } from '../utils/output';

interface ValidateOptions {
  targetWorkspace: string;
  agentId?: string;
  targetAgentDir?: string;
  config?: string;
  json?: boolean;
}

export async function runValidate(options: ValidateOptions): Promise<void> {
  if (!options.targetWorkspace) {
    throw new Error('validate requires --target-workspace <path>');
  }

  const report = await validateImportedWorkspace({
    targetWorkspacePath: path.resolve(options.targetWorkspace),
    agentId: options.agentId,
    targetAgentDir: options.targetAgentDir,
    targetConfigPath: options.config ? path.resolve(options.config) : undefined,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [`Validation: ${report.failed.length === 0 ? 'passed' : 'FAILED'}`];

  pushSection(lines, 'Passed', report.passed);
  pushSection(lines, 'Warnings', report.warnings);
  pushSection(lines, 'Failed', report.failed);
  pushSection(lines, 'Next steps', report.nextSteps);

  console.log(lines.join('\n'));
}

export function registerValidateCommand(command: Command): void {
  command
    .description('Validate an imported workspace and optional config wiring. When a runtime layer was imported, also checks runtime file integrity and agentDir consistency.')
    .requiredOption('--target-workspace <path>', 'Imported target workspace path')
    .option('--agent-id <id>', 'Expected target agent id')
    .option('--target-agent-dir <path>', 'Expected target agentDir for runtime validation. Auto-inferred from import metadata when omitted.')
    .option('--config <path>', 'Target OpenClaw config path for consistency checks')
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runValidate);
}
