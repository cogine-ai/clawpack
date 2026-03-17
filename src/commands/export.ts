import path from 'node:path';
import type { Command } from 'commander';
import { extractAgentDefinition } from '../core/agent-extract';
import { writePackageArchive, writePackageDirectory } from '../core/package-write';
import { detectSkills } from '../core/skills-detect';
import { scanWorkspace } from '../core/workspace-scan';

interface ExportOptions {
  workspace: string;
  out: string;
  name?: string;
  config?: string;
  agentId?: string;
  archive?: boolean;
  json?: boolean;
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
  const packageName =
    options.name ?? path.basename(options.out).replace(/\.ocpkg(\.tar\.gz)?$/, '');

  const writeParams = {
    outputPath: path.resolve(options.out),
    packageName,
    scan,
    skills,
    agentDefinition,
  };

  const result = options.archive
    ? await writePackageArchive(writeParams)
    : await writePackageDirectory(writeParams);

  const report = {
    status: 'ok' as const,
    packageRoot: result.packageRoot,
    manifestPath: result.manifestPath,
    fileCount: result.fileCount,
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    [
      'Export complete',
      `  Package: ${report.packageRoot}`,
      `  Manifest: ${report.manifestPath}`,
      `  Files: ${report.fileCount}`,
    ].join('\n'),
  );
}

export function registerExportCommand(command: Command): void {
  command
    .description('Export a portable .ocpkg directory or .ocpkg.tar.gz archive from a workspace.')
    .requiredOption('--workspace <path>', 'Source workspace path')
    .requiredOption('--out <path>', 'Output package path')
    .option('--name <package-name>', 'Package name override')
    .option('--config <path>', 'OpenClaw config path')
    .option('--agent-id <id>', 'Source agent id override')
    .option('--archive', 'Produce a .ocpkg.tar.gz single-file archive')
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runExport);
}
