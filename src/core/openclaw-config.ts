import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AgentDefinition } from './types';
import { readFile, writeFile } from 'node:fs/promises';
import stripJsonComments from 'strip-json-comments';

export interface AgentConfigEntry {
  id?: string;
  default?: boolean;
  name?: string;
  workspace?: string;
  agentDir?: string;
  identity?: {
    name?: string;
    [key: string]: unknown;
  };
  model?: {
    default?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MinimalOpenClawConfig {
  version?: string;
  openclawVersion?: string;
  identity?: {
    name?: string;
    [key: string]: unknown;
  };
  agent?: AgentConfigEntry;
  agents?: {
    defaults?: Record<string, unknown>;
    list?: AgentConfigEntry[];
  };
  [key: string]: unknown;
}

export async function discoverOpenClawConfig(params: { configPath?: string; cwd?: string } = {}): Promise<{ configPath: string }> {
  const candidates = params.configPath
    ? [path.resolve(params.configPath)]
    : process.env.OPENCLAW_CONFIG_PATH
      ? [path.resolve(process.env.OPENCLAW_CONFIG_PATH)]
      : [path.resolve(process.env.HOME ?? '~', '.openclaw', 'openclaw.json')];

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

export function resolveAgentFromConfig(
  config: MinimalOpenClawConfig,
  agentId?: string,
): { agent: AgentConfigEntry; resolvedId: string } | undefined {
  if (config.agent) {
    const singleId = config.agent.id ?? 'default';
    if (!agentId || agentId === singleId) {
      return { agent: config.agent, resolvedId: singleId };
    }
  }

  if (config.agents?.list) {
    for (const entry of config.agents.list) {
      const entryId = entry.id;
      if (!entryId) continue;
      if (agentId === entryId) {
        return { agent: entry, resolvedId: entryId };
      }
    }
    if (!agentId) {
      const defaultAgent = config.agents.list.find((e) => e.default) ?? config.agents.list[0];
      if (defaultAgent) {
        return { agent: defaultAgent, resolvedId: defaultAgent.id ?? 'default' };
      }
    }
  }

  return undefined;
}

export function extractPortableAgentDefinition(params: {
  config: MinimalOpenClawConfig;
  configPath: string;
  workspacePath: string;
  agentId?: string;
}): AgentDefinition {
  const workspaceBasename = path.basename(params.workspacePath);
  const fallbackId = workspaceBasename.replace(/^workspace-/, '');

  // Resolution priority:
  // 1. If agentId is given, look up by id via resolveAgentFromConfig
  // 2. Otherwise, try to match by workspace path via findAgentByWorkspace
  // 3. Final fallback: resolveAgentFromConfig with no agentId returns the default/first agent
  const resolved =
    (params.agentId
      ? resolveAgentFromConfig(params.config, params.agentId)
      : findAgentByWorkspace(params.config, params.workspacePath)) ??
    resolveAgentFromConfig(params.config, params.agentId);

  const selectedAgentId = resolved?.resolvedId ?? params.agentId ?? fallbackId;
  const sourceAgent = resolved?.agent;

  if (!sourceAgent) {
    throw new Error(`Agent not found in OpenClaw config: ${selectedAgentId}`);
  }

  const topLevelIdentityName = params.config.identity?.name;
  const suggestedName =
    sourceAgent.name ??
    sourceAgent.identity?.name ??
    topLevelIdentityName ??
    toTitleCase(selectedAgentId.replace(/-/g, ' '));
  const identityName = sourceAgent.identity?.name ?? topLevelIdentityName ?? suggestedName;

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

export function hasAgentInConfig(config: MinimalOpenClawConfig, agentId: string): boolean {
  return resolveAgentFromConfig(config, agentId) !== undefined;
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

  if (hasAgentInConfig(config, params.targetAgentId) && !params.force) {
    throw new Error(`Target agent already exists in OpenClaw config: ${params.targetAgentId}`);
  }

  const newEntry: AgentConfigEntry = {
    id: params.targetAgentId,
    name: params.portableAgentDefinition.agent.suggestedName,
    workspace: params.targetWorkspacePath,
    identity: {
      name: params.portableAgentDefinition.agent.identity.name,
    },
    ...(params.portableAgentDefinition.agent.model?.default
      ? { model: { default: params.portableAgentDefinition.agent.model.default } }
      : {}),
  };

  if (config.agents?.list) {
    const idx = config.agents.list.findIndex((e) => e.id === params.targetAgentId);
    if (idx >= 0) {
      config.agents.list[idx] = newEntry;
    } else {
      config.agents.list.push(newEntry);
    }
  } else if (config.agent) {
    const existingId = config.agent.id ?? 'default';
    if (existingId === params.targetAgentId) {
      config.agent = newEntry;
    } else {
      const existingEntry: AgentConfigEntry = { id: existingId, ...config.agent };
      delete (config as Record<string, unknown>).agent;
      config.agents = { list: [existingEntry, newEntry] };
    }
  } else {
    config.agents = { list: [newEntry] };
  }

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

function findAgentByWorkspace(
  config: MinimalOpenClawConfig,
  workspacePath: string,
): { agent: AgentConfigEntry; resolvedId: string } | undefined {
  const basename = path.basename(workspacePath);

  if (config.agent?.workspace && path.basename(config.agent.workspace) === basename) {
    return { agent: config.agent, resolvedId: config.agent.id ?? 'default' };
  }

  if (config.agents?.list) {
    for (const entry of config.agents.list) {
      if (entry.workspace && path.basename(entry.workspace) === basename) {
        return { agent: entry, resolvedId: entry.id ?? 'default' };
      }
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
