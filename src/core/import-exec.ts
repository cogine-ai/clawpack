import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJsonFile } from '../utils/json';
import { upsertPortableAgentDefinition } from './openclaw-config';
import { applyPathRewrites } from './path-rewrite';
import type { ExecutableImportPlan, ImportResult, ReadPackageResult } from './types';

export async function executeImport(params: {
  pkg: ReadPackageResult;
  plan: ExecutableImportPlan;
}): Promise<ImportResult> {
  if (params.plan.writePlan.overwriteExisting) {
    await rm(params.plan.writePlan.targetWorkspacePath, { recursive: true, force: true });
  }

  await mkdir(params.plan.writePlan.targetWorkspacePath, { recursive: true });

  for (const file of params.plan.writePlan.workspaceFiles) {
    await mkdir(path.dirname(file.targetPath), { recursive: true });
    await cp(file.sourcePath, file.targetPath);
  }

  const importedRuntimeFiles = await executeRuntimeImport(params);

  await mkdir(params.plan.writePlan.metadataDirectory, { recursive: true });
  const agentRecordPath = path.join(
    params.plan.writePlan.metadataDirectory,
    'agent-definition.json',
  );
  const importRecordPath = path.join(params.plan.writePlan.metadataDirectory, 'import-result.json');

  const configFiles: string[] = [];
  if (params.plan.writePlan.targetConfigPath) {
    await upsertPortableAgentDefinition({
      configPath: params.plan.writePlan.targetConfigPath,
      portableAgentDefinition: params.pkg.agentDefinition,
      targetAgentId: params.plan.writePlan.targetAgentId,
      targetWorkspacePath: params.plan.writePlan.targetWorkspacePath,
      targetAgentDir: params.plan.writePlan.runtimePlan?.targetAgentDir,
      force: params.plan.writePlan.overwriteExisting,
    });
    configFiles.push(params.plan.writePlan.targetConfigPath);
  }

  await writeJsonFile(agentRecordPath, {
    agentId: params.plan.writePlan.targetAgentId,
    importedFromPackage: params.pkg.manifest.name,
    packageType: params.pkg.manifest.packageType,
    portableAgentDefinition: params.pkg.agentDefinition,
    persistedToConfig: params.plan.writePlan.targetConfigPath ?? null,
    targetAgentDir: params.plan.writePlan.runtimePlan?.targetAgentDir ?? null,
  });

  const targetAgentDir = params.plan.writePlan.runtimePlan?.targetAgentDir;

  const result: ImportResult = {
    status: 'ok',
    importedFiles: params.plan.writePlan.workspaceFiles.map((file) => file.relativePath),
    importedRuntimeFiles,
    metadataFiles: [agentRecordPath, importRecordPath, ...configFiles],
    warnings: params.plan.warnings,
    nextSteps: params.plan.nextSteps,
    targetWorkspacePath: params.plan.writePlan.targetWorkspacePath,
    targetAgentDir,
    agentId: params.plan.writePlan.targetAgentId,
  };

  await writeJsonFile(importRecordPath, result);
  return result;
}

async function executeRuntimeImport(params: {
  pkg: ReadPackageResult;
  plan: ExecutableImportPlan;
}): Promise<string[]> {
  const rp = params.plan.writePlan.runtimePlan;
  if (!rp || rp.files.length === 0) return [];

  const imported: string[] = [];

  for (const file of rp.files) {
    await mkdir(path.dirname(file.targetPath), { recursive: true });

    if (file.relativePath === 'settings.json' && rp.pathRewrites.length > 0) {
      const raw = await readFile(file.sourcePath, 'utf8');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        throw new Error(
          `Failed to parse ${file.sourcePath} for path rewriting: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      const rewritten = applyPathRewrites(
        parsed,
        rp.sourceWorkspacePath,
        rp.sourceAgentDir,
        params.plan.writePlan.targetWorkspacePath,
        rp.targetAgentDir,
      );
      await writeFile(file.targetPath, `${JSON.stringify(rewritten, null, 2)}\n`, 'utf8');
    } else {
      await cp(file.sourcePath, file.targetPath);
    }

    imported.push(file.relativePath);
  }

  return imported;
}
