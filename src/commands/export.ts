import path from 'node:path';
import type { Command } from 'commander';
import { extractAgentDefinition } from '../core/agent-extract';
import { detectOpenClawVersion, resolveAgentDir } from '../core/openclaw-config';
import { writePackageArchive, writePackageDirectory } from '../core/package-write';
import { normalizeRuntimeMode } from '../core/runtime-mode';
import { scanRuntime } from '../core/runtime-scan';
import { detectSkills } from '../core/skills-detect';
import type { RuntimeScanResult } from '../core/types';
import { scanWorkspace } from '../core/workspace-scan';

interface ExportOptions {
  workspace: string;
  out: string;
  name?: string;
  config?: string;
  agentId?: string;
  archive?: boolean;
  json?: boolean;
  runtimeMode?: string;
}

export async function runExport(options: ExportOptions): Promise<void> {
  if (!options.workspace || !options.out) {
    throw new Error('export requires --workspace <path> and --out <path>');
  }

  const runtimeMode = normalizeRuntimeMode(options.runtimeMode);
  const scan = await scanWorkspace(path.resolve(options.workspace));
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(scan.workspacePath, {
    configPath: options.config,
    agentId: options.agentId,
  });
  const openclawVersion = await detectOpenClawVersion({
    configPath: options.config,
    cwd: scan.workspacePath,
  });
  const packageName =
    options.name ?? path.basename(options.out).replace(/\.ocpkg(\.tar\.gz)?$/, '');

  let runtimeScan: RuntimeScanResult | undefined;
  if (runtimeMode && runtimeMode !== 'none') {
    const agentDir = await resolveAgentDir({
      configPath: options.config,
      workspacePath: scan.workspacePath,
      agentId: options.agentId,
    });

    if (!agentDir) {
      throw new Error(
        'Cannot export runtime layer: agentDir could not be resolved from OpenClaw config. ' +
        'Ensure the agent entry includes an agentDir field, or use --runtime-mode none.',
      );
    }

    runtimeScan = await scanRuntime({
      mode: runtimeMode,
      agentDir,
      workspacePath: scan.workspacePath,
    });
  }

  const writeParams = {
    outputPath: path.resolve(options.out),
    packageName,
    scan,
    skills,
    agentDefinition,
    openclawVersion,
    runtimeScan,
  };

  const result = options.archive
    ? await writePackageArchive(writeParams)
    : await writePackageDirectory(writeParams);

  const report = {
    status: 'ok' as const,
    packageRoot: result.packageRoot,
    manifestPath: result.manifestPath,
    fileCount: result.fileCount,
    runtimeMode: runtimeScan?.mode,
    runtimeFiles: runtimeScan?.includedFiles.map(f => f.relativePath),
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const lines = [
    'Export complete',
    `  Package: ${report.packageRoot}`,
    `  Manifest: ${report.manifestPath}`,
    `  Files: ${report.fileCount}`,
  ];
  if (runtimeScan && runtimeScan.mode !== 'none') {
    lines.push(`  Runtime mode: ${runtimeScan.mode}`);
    lines.push(`  Runtime files: ${runtimeScan.includedFiles.length}`);
  }
  console.log(lines.join('\n'));
}

export function registerExportCommand(command: Command): void {
  command
    .description('Export a portable .ocpkg directory or .ocpkg.tar.gz archive from a workspace.')
    .requiredOption('--workspace <path>', 'Source workspace path')
    .requiredOption('--out <path>', 'Output package path')
    .option('--name <package-name>', 'Package name override')
    .option('--config <path>', 'OpenClaw config path')
    .option('--agent-id <id>', 'Source agent id override')
    .option(
      '--runtime-mode <mode>',
      'Runtime layer mode: none (skip), default (settings, prompts, themes, models), or full (adds skills, extensions). Requires a resolvable agentDir in OpenClaw config. Auth and session files are always excluded.',
    )
    .option('--archive', 'Produce a .ocpkg.tar.gz single-file archive')
    .option('--json', 'Emit the full machine-readable JSON report')
    .action(runExport);
}
