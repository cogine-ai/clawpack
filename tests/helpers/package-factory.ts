import { rm } from 'node:fs/promises';
import { extractAgentDefinition } from '../../src/core/agent-extract';
import { readPackageDirectory } from '../../src/core/package-read';
import { writePackageDirectory } from '../../src/core/package-write';
import { detectSkills } from '../../src/core/skills-detect';
import type { ReadPackageResult } from '../../src/core/types';
import { scanWorkspace } from '../../src/core/workspace-scan';

export async function buildTestPackage(
  workspacePath: string,
  outputPath: string,
  options?: { packageName?: string; configPath?: string; agentId?: string },
): Promise<ReadPackageResult> {
  await rm(outputPath, { recursive: true, force: true });
  const scan = await scanWorkspace(workspacePath);
  const skills = await detectSkills(scan);
  const agentDefinition = await extractAgentDefinition(workspacePath, {
    configPath: options?.configPath,
    agentId: options?.agentId,
  });
  await writePackageDirectory({
    outputPath,
    packageName: options?.packageName ?? 'test-package',
    scan,
    skills,
    agentDefinition,
  });
  return readPackageDirectory(outputPath);
}
