import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentDefinition } from './types';
import { readFile, writeFile } from 'node:fs/promises';
import stripJsonComments from 'strip-json-comments';

export interface MinimalOpenClawConfig {
  version?: string;
  openclawVersion?: string;
  agents?: Record<string, {
    id?: string;
    name?: string;
    workspace?: string;
    identity?: {
      name?: string;
    };
    model?: {
      default?: string;
    };
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export async function discoverOpenClawConfig(params: { configPath?: string; cwd?: string } = {}): Promise<{ configPath: string }> {
  const candidates = params.configPath
    ? [path.resolve(params.configPath)]
    : [
        path.resolve(params.cwd ?? process.cwd(), 'openclaw-config.json'),
        path.resolve(params.cwd ?? process.cwd(), 'openclaw-config.jsonc'),
        path.resolve(process.env.HOME ?? '~', '.openclaw', 'config.json'),
        path.resolve(process.env.HOME ?? '~', '.openclaw', 'config.jsonc'),
      ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return { configPath: candidate };
    } catch {}
  }

  throw new Error(`OpenClaw config not found. Checked: ${candidates.join(', ')}`);
}

export async function loadOpenClawConfig(params: { configPath?: string; cwd?: string }): Promise<{ configPath: string; config: MinimalOpenClawConfig }> {
  const discovered = await discoverOpenClawConfig(params);
  const raw = await readFile(discovered.configPath, 'utf8');
  return {
    configPath: discovered.configPath,
    config: parseJsonc(raw) as MinimalOpenClawConfig,
  };
}

export async function detectOpenClawVersion(params: { configPath?: string; cwd?: string }): Promise<string | undefined> {
  try {
    const { config } = await loadOpenClawConfig(params);
    return extractOpenClawVersion(config);
  } catch {
    return undefined;
  }
}

export function extractPortableAgentDefinition(params: {
  config: MinimalOpenClawConfig;
  configPath: string;
  workspacePath: string;
  agentId?: string;
}): AgentDefinition {
  const workspaceBasename = path.basename(params.workspacePath);
  const fallbackId = workspaceBasename.replace(/^workspace-/, '');
  const selectedAgentId = params.agentId ?? findAgentIdByWorkspace(params.config, params.workspacePath) ?? fallbackId;
  const sourceAgent = params.config.agents?.[selectedAgentId];

  if (!sourceAgent) {
    throw new Error(`Agent not found in OpenClaw config: ${selectedAgentId}`);
  }

  const suggestedName = sourceAgent.name ?? sourceAgent.identity?.name ?? toTitleCase(selectedAgentId.replace(/-/g, ' '));
  const identityName = sourceAgent.identity?.name ?? suggestedName;

  return {
    agent: {
      suggestedId: selectedAgentId,
      suggestedName,
      workspace: {
        suggestedBasename: workspaceBasename,
      },
      identity: {
        name: identityName,
      },
      model: sourceAgent.model?.default ? { default: sourceAgent.model.default } : undefined,
    },
    fieldClassification: {
      'agent.suggestedId': 'requiresInputOnImport',
      'agent.suggestedName': 'portable',
      'agent.workspace.suggestedBasename': 'requiresInputOnImport',
      'agent.identity.name': 'portable',
      ...(sourceAgent.model?.default ? { 'agent.model.default': 'portable' } : {}),
      'agent.channelBindings': 'excluded',
      'agent.secrets': 'excluded',
    },
    notes: [`Portable agent definition derived from OpenClaw config at ${params.configPath}.`],
  };
}

export async function upsertPortableAgentDefinition(params: {
  configPath: string;
  portableAgentDefinition: AgentDefinition;
  targetAgentId: string;
  targetWorkspacePath: string;
  force?: boolean;
}): Promise<{ configPath: string; created: boolean; updated: boolean }> {
  const resolvedPath = path.resolve(params.configPath);
  let config: MinimalOpenClawConfig = {};
  let existed = false;

  try {
    const raw = await readFile(resolvedPath, 'utf8');
    config = parseJsonc(raw) as MinimalOpenClawConfig;
    existed = true;
  } catch {}

  config.agents ??= {};
  if (config.agents[params.targetAgentId] && !params.force) {
    throw new Error(`Target agent already exists in OpenClaw config: ${params.targetAgentId}`);
  }

  config.agents[params.targetAgentId] = {
    id: params.targetAgentId,
    name: params.portableAgentDefinition.agent.suggestedName,
    workspace: params.targetWorkspacePath,
    identity: {
      name: params.portableAgentDefinition.agent.identity.name,
    },
    ...(params.portableAgentDefinition.agent.model?.default
      ? {
          model: {
            default: params.portableAgentDefinition.agent.model.default,
          },
        }
      : {}),
  };

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  return { configPath: resolvedPath, created: !existed, updated: existed };
}

function parseJsonc(value: string): unknown {
  const withoutComments = stripJsonComments(value);
  return JSON.parse(withoutComments);
}

function extractOpenClawVersion(config: MinimalOpenClawConfig): string | undefined {
  for (const candidate of [config.openclawVersion, config.version]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function findAgentIdByWorkspace(config: MinimalOpenClawConfig, workspacePath: string): string | undefined {
  for (const [agentId, agent] of Object.entries(config.agents ?? {})) {
    if (agent.workspace && path.basename(agent.workspace) === path.basename(workspacePath)) {
      return agentId;
    }
  }
  return undefined;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
