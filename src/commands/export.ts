import path from 'node:path';
import type { Command } from 'commander';
import { extractAgentDefinition } from '../core/agent-extract';
import { writePackageDirectory } from '../core/package-write';
import { detectSkills } from '../core/skills-detect';
import { scanWorkspace } from '../core/workspace-scan';

interface ExportOptions {
  workspace: string;
  out: string;
  name?: string;
  config?: string;
  agentId?: string;
}

export async function runExport(options: ExportOptions): Promise<void> {
  if (!options.workspace || !options.out) {
    throw new Error('export requires --workspace <path> and --out <path>');
  }

  const scan = await scanWorkspace(path.resolve(options.workspace));
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(scan.workspacePath, {
    configPath: options.config,
    agentId: options.agentId,
  });
  const packageName = options.name ?? path.basename(options.out).replace(/\.ocpkg$/, '');

  const result = await writePackageDirectory({
    outputPath: path.resolve(options.out),
    packageName,
    scan,
    skills,
    agentDefinition,
  });

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        packageRoot: result.packageRoot,
        manifestPath: result.manifestPath,
        fileCount: result.fileCount,
      },
      null,
      2,
    ),
  );
}

export function registerExportCommand(command: Command): void {
  command
    .description('Export a portable .ocpkg directory from a workspace.')
    .requiredOption('--workspace <path>', 'Source workspace path')
    .requiredOption('--out <path>', 'Output package directory path')
    .option('--name <package-name>', 'Package name override')
    .option('--config <path>', 'OpenClaw config path')
    .option('--agent-id <id>', 'Source agent id override')
    .action(runExport);
}
