import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { ExecutableImportPlan, ImportResult, ReadPackageResult } from './types';
import { writeJsonFile } from '../utils/json';
import { upsertPortableAgentDefinition } from './openclaw-config';

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
  });

  const result: ImportResult = {
    status: 'ok',
    importedFiles: params.plan.writePlan.workspaceFiles.map((file) => file.relativePath),
    metadataFiles: [agentRecordPath, importRecordPath, ...configFiles],
    warnings: params.plan.warnings,
    nextSteps: params.plan.nextSteps,
    targetWorkspacePath: params.plan.writePlan.targetWorkspacePath,
    agentId: params.plan.writePlan.targetAgentId,
  };

  await writeJsonFile(importRecordPath, result);
  return result;
}
