import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SKILL_REFERENCE_PATTERNS, SKILLS_MODE } from './constants';
import type { SkillsManifest, WorkspaceScanResult } from './types';

export async function detectSkills(scan: WorkspaceScanResult): Promise<SkillsManifest> {
  const workspaceSkills = await detectWorkspaceSkills(scan.workspacePath);
  const referencedSkills = new Set<string>();

  for (const file of scan.includedFiles) {
    if (!file.relativePath.endsWith('.md')) continue;
    const content = await readFile(file.absolutePath, 'utf8');
    for (const pattern of SKILL_REFERENCE_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const candidate = match[1]?.trim();
        if (candidate) {
          referencedSkills.add(candidate);
        }
      }
    }
  }

  return {
    mode: SKILLS_MODE,
    workspaceSkills,
    referencedSkills: [...referencedSkills].sort(),
    notes: ['Install or verify referenced skills on the target OpenClaw instance.'],
  };
}

async function detectWorkspaceSkills(workspacePath: string): Promise<string[]> {
  const skillsPath = path.join(workspacePath, 'skills');
  try {
    await access(skillsPath);
    return ['skills/'];
  } catch {
    return [];
  }
}
