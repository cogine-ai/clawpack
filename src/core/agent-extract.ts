import path from 'node:path';
import { extractPortableAgentDefinition, loadOpenClawConfig } from './openclaw-config';
import type { AgentDefinition } from './types';

export async function extractAgentDefinition(
  workspacePath: string,
  options: { configPath?: string; agentId?: string } = {},
): Promise<AgentDefinition> {
  try {
    const loaded = await loadOpenClawConfig({ configPath: options.configPath, cwd: workspacePath });
    return extractPortableAgentDefinition({
      config: loaded.config,
      configPath: loaded.configPath,
      workspacePath,
      agentId: options.agentId,
    });
  } catch {
    const basename = path.basename(workspacePath);
    const suggestedId = basename.replace(/^workspace-/, '');
    const suggestedName = toTitleCase(suggestedId.replace(/-/g, ' '));

    return {
      agent: {
        suggestedId,
        suggestedName,
        workspace: {
          suggestedBasename: basename,
        },
        identity: {
          name: suggestedName,
        },
      },
      fieldClassification: {
        'agent.suggestedId': 'requiresInputOnImport',
        'agent.suggestedName': 'portable',
        'agent.workspace.suggestedBasename': 'requiresInputOnImport',
        'agent.identity.name': 'portable',
      },
      notes: ['Conservative placeholder agent definition generated from workspace basename.'],
    };
  }
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
