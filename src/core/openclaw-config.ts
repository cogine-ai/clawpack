import { readFileSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import JSON5 from 'json5';
import type { AgentDefinition } from './types';

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

const NEW_STATE_DIRNAME = '.openclaw';
const LEGACY_STATE_DIRNAMES = ['.clawdbot'];
const CONFIG_FILENAME = 'openclaw.json';
const LEGACY_CONFIG_FILENAMES = ['clawdbot.json'];
const MAX_INCLUDE_DEPTH = 10;

export async function discoverOpenClawConfig(
  params: { configPath?: string; cwd?: string } = {},
): Promise<{ configPath: string }> {
  const candidates = params.configPath
    ? [resolveUserPath(params.configPath)]
    : resolveDefaultConfigCandidates();

  const seen = new Set<string>();
  const deduped = candidates.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });

  for (const candidate of deduped) {
    try {
      await access(candidate);
      return { configPath: candidate };
    } catch {}
  }

  throw new Error(`OpenClaw config not found. Checked: ${deduped.join(', ')}`);
}

export async function loadOpenClawConfig(params: {
  configPath?: string;
  cwd?: string;
}): Promise<{ configPath: string; config: MinimalOpenClawConfig }> {
  const discovered = await discoverOpenClawConfig(params);
  const raw = await readFile(discovered.configPath, 'utf8');
  const parsed = parseConfigFile(raw);
  return {
    configPath: discovered.configPath,
    config: resolveConfigIncludes(parsed, discovered.configPath) as MinimalOpenClawConfig,
  };
}

export async function detectOpenClawVersion(params: {
  configPath?: string;
  cwd?: string;
}): Promise<string | undefined> {
  try {
    const { config } = await loadOpenClawConfig(params);
    return extractOpenClawVersion(config);
  } catch {
    return undefined;
  }
}

export async function resolveAgentDir(params: {
  configPath?: string;
  cwd?: string;
  agentId?: string;
  workspacePath?: string;
}): Promise<string | undefined> {
  try {
    const { config, configPath } = await loadOpenClawConfig(params);
    const workspacePath = params.workspacePath ?? params.cwd;
    const resolved =
      (params.agentId
        ? resolveAgentFromConfig(config, params.agentId)
        : workspacePath
          ? findAgentByWorkspace(config, workspacePath, configPath)
          : undefined) ?? resolveAgentFromConfig(config, params.agentId);

    if (!resolved?.agent.agentDir) return undefined;

    const agentDir = resolved.agent.agentDir;
    return path.isAbsolute(agentDir) ? agentDir : path.resolve(path.dirname(configPath), agentDir);
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
      : findAgentByWorkspace(params.config, params.workspacePath, params.configPath)) ??
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

  const {
    identity: _identity,
    name: _name,
    id: _id,
    workspace: _workspace,
    default: _default,
    ...extraFields
  } = sourceAgent;

  const modelConfig = sourceAgent.model?.default
    ? { default: sourceAgent.model.default, ...sourceAgent.model }
    : undefined;

  return {
    agent: {
      suggestedId: selectedAgentId,
      suggestedName,
      workspace: {
        suggestedBasename: workspaceBasename,
      },
      identity: {
        ...(sourceAgent.identity ?? {}),
        name: identityName,
      },
      model: modelConfig,
      ...(extraFields.tools
        ? { tools: extraFields.tools as AgentDefinition['agent']['tools'] }
        : {}),
      ...(extraFields.skills ? { skills: extraFields.skills as string[] } : {}),
      ...(extraFields.heartbeat
        ? { heartbeat: extraFields.heartbeat as Record<string, unknown> }
        : {}),
      ...(extraFields.sandbox ? { sandbox: extraFields.sandbox as Record<string, unknown> } : {}),
      ...(extraFields.runtime ? { runtime: extraFields.runtime as Record<string, unknown> } : {}),
      ...(extraFields.params ? { params: extraFields.params as Record<string, unknown> } : {}),
      ...(extraFields.subagents
        ? { subagents: extraFields.subagents as Record<string, unknown> }
        : {}),
      ...(extraFields.groupChat
        ? { groupChat: extraFields.groupChat as Record<string, unknown> }
        : {}),
      ...(extraFields.humanDelay
        ? { humanDelay: extraFields.humanDelay as Record<string, unknown> }
        : {}),
      ...(extraFields.memorySearch
        ? { memorySearch: extraFields.memorySearch as Record<string, unknown> }
        : {}),
    },
    fieldClassification: {
      'agent.suggestedId': 'requiresInputOnImport',
      'agent.suggestedName': 'portable',
      'agent.workspace.suggestedBasename': 'requiresInputOnImport',
      'agent.identity': 'portable',
      ...(modelConfig ? { 'agent.model': 'portable' } : {}),
      ...(extraFields.tools ? { 'agent.tools': 'portable' } : {}),
      ...(extraFields.skills ? { 'agent.skills': 'portable' } : {}),
      ...(extraFields.heartbeat ? { 'agent.heartbeat': 'portable' } : {}),
      ...(extraFields.sandbox ? { 'agent.sandbox': 'portable' } : {}),
      ...(extraFields.runtime ? { 'agent.runtime': 'portable' } : {}),
      ...(extraFields.params ? { 'agent.params': 'portable' } : {}),
      ...(extraFields.subagents ? { 'agent.subagents': 'requiresInputOnImport' } : {}),
      ...(extraFields.groupChat ? { 'agent.groupChat': 'requiresInputOnImport' } : {}),
      ...(extraFields.humanDelay ? { 'agent.humanDelay': 'portable' } : {}),
      ...(extraFields.memorySearch ? { 'agent.memorySearch': 'portable' } : {}),
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
  targetAgentDir?: string;
  force?: boolean;
}): Promise<{ configPath: string; created: boolean; updated: boolean }> {
  const resolvedPath = path.resolve(params.configPath);
  let config: MinimalOpenClawConfig = {};
  let existed = false;

  try {
    const raw = await readFile(resolvedPath, 'utf8');
    config = parseConfigFile(raw) as MinimalOpenClawConfig;
    existed = true;
  } catch {}

  if (hasAgentInConfig(config, params.targetAgentId) && !params.force) {
    throw new Error(`Target agent already exists in OpenClaw config: ${params.targetAgentId}`);
  }

  const newEntry: AgentConfigEntry = {
    id: params.targetAgentId,
    name: params.portableAgentDefinition.agent.suggestedName,
    workspace: params.targetWorkspacePath,
    ...(params.targetAgentDir ? { agentDir: params.targetAgentDir } : {}),
    identity: {
      ...params.portableAgentDefinition.agent.identity,
      name: params.portableAgentDefinition.agent.identity.name,
    },
    ...(params.portableAgentDefinition.agent.model
      ? { model: { ...params.portableAgentDefinition.agent.model } }
      : {}),
    ...(params.portableAgentDefinition.agent.tools
      ? { tools: params.portableAgentDefinition.agent.tools }
      : {}),
    ...(params.portableAgentDefinition.agent.skills
      ? { skills: params.portableAgentDefinition.agent.skills }
      : {}),
    ...(params.portableAgentDefinition.agent.heartbeat
      ? { heartbeat: params.portableAgentDefinition.agent.heartbeat }
      : {}),
    ...(params.portableAgentDefinition.agent.sandbox
      ? { sandbox: params.portableAgentDefinition.agent.sandbox }
      : {}),
    ...(params.portableAgentDefinition.agent.runtime
      ? { runtime: params.portableAgentDefinition.agent.runtime }
      : {}),
    ...(params.portableAgentDefinition.agent.params
      ? { params: params.portableAgentDefinition.agent.params }
      : {}),
    ...(params.portableAgentDefinition.agent.humanDelay
      ? { humanDelay: params.portableAgentDefinition.agent.humanDelay }
      : {}),
    ...(params.portableAgentDefinition.agent.memorySearch
      ? { memorySearch: params.portableAgentDefinition.agent.memorySearch }
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

function parseConfigFile(value: string): unknown {
  return JSON5.parse(value);
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
  configPath?: string,
): { agent: AgentConfigEntry; resolvedId: string } | undefined {
  const resolvedWorkspacePath = path.resolve(workspacePath);
  const basename = path.basename(resolvedWorkspacePath);
  const entries = [
    ...(config.agent ? [{ agent: config.agent, resolvedId: config.agent.id ?? 'default' }] : []),
    ...(
      config.agents?.list?.map((entry) => ({
        agent: entry,
        resolvedId: entry.id ?? 'default',
      })) ?? []
    ),
  ];

  const exactMatch = entries.find(({ agent }) => {
    const candidate = resolveConfigWorkspacePath(agent.workspace, configPath);
    return candidate !== undefined && candidate === resolvedWorkspacePath;
  });
  if (exactMatch) return exactMatch;

  const basenameMatches = entries.filter(({ agent }) => {
    const candidate = resolveConfigWorkspacePath(agent.workspace, configPath);
    return candidate !== undefined && path.basename(candidate) === basename;
  });

  return basenameMatches.length === 1 ? basenameMatches[0] : undefined;
}

function resolveConfigWorkspacePath(workspace: string | undefined, configPath?: string): string | undefined {
  if (!workspace) return undefined;
  if (path.isAbsolute(workspace)) return path.resolve(workspace);
  if (configPath) return path.resolve(path.dirname(configPath), workspace);
  return path.resolve(workspace);
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveDefaultConfigCandidates(): string[] {
  const explicitConfigPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (explicitConfigPath) {
    return [resolveUserPath(explicitConfigPath)];
  }

  const stateDirOverride = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateDirOverride) {
    return configCandidatesForStateDir(resolveUserPath(stateDirOverride));
  }

  const homePath = homedir();
  if (!homePath) return [];

  const stateDirs = [
    path.join(homePath, NEW_STATE_DIRNAME),
    ...LEGACY_STATE_DIRNAMES.map((dirname) => path.join(homePath, dirname)),
  ];

  return stateDirs.flatMap((stateDir) => configCandidatesForStateDir(path.resolve(stateDir)));
}

function configCandidatesForStateDir(stateDir: string): string[] {
  return [
    path.join(stateDir, CONFIG_FILENAME),
    ...LEGACY_CONFIG_FILENAMES.map((filename) => path.join(stateDir, filename)),
  ];
}

function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '~') {
    return path.resolve(homedir());
  }

  if (trimmed.startsWith('~/')) {
    return path.resolve(homedir(), trimmed.slice(2));
  }

  return path.resolve(trimmed);
}

function resolveConfigIncludes(config: unknown, configPath: string): unknown {
  return new IncludeProcessor(configPath, path.resolve(path.dirname(configPath))).process(config);
}

class IncludeProcessor {
  private readonly visited: Set<string>;

  constructor(
    private readonly basePath: string,
    private readonly rootDir: string,
    private readonly depth = 0,
    visited: Iterable<string> = [],
  ) {
    this.visited = new Set([...visited, path.normalize(basePath)]);
  }

  process(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.process(item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    if (!('$include' in value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [key, this.process(nestedValue)]),
      );
    }

    return this.processIncludedObject(value);
  }

  private processIncludedObject(value: Record<string, unknown>): unknown {
    const includeValue = value.$include;
    const siblingEntries = Object.entries(value).filter(([key]) => key !== '$include');
    const includedValue = this.resolveIncludeValue(includeValue);

    if (siblingEntries.length === 0) {
      return includedValue;
    }

    if (!isPlainObject(includedValue)) {
      throw new Error('OpenClaw config $include sibling keys require an included object value.');
    }

    const processedSiblings = Object.fromEntries(
      siblingEntries.map(([key, nestedValue]) => [key, this.process(nestedValue)]),
    );

    return deepMerge(includedValue, processedSiblings);
  }

  private resolveIncludeValue(includeValue: unknown): unknown {
    if (typeof includeValue === 'string') {
      return this.loadIncludedFile(includeValue);
    }

    if (Array.isArray(includeValue)) {
      return includeValue.reduce<unknown>((merged, item) => {
        if (typeof item !== 'string') {
          throw new Error(`OpenClaw config $include items must be strings; received ${typeof item}.`);
        }

        return deepMerge(merged, this.loadIncludedFile(item));
      }, {});
    }

    throw new Error(`OpenClaw config $include must be a string or string[]; received ${typeof includeValue}.`);
  }

  private loadIncludedFile(includePath: string): unknown {
    if (this.depth >= MAX_INCLUDE_DEPTH) {
      throw new Error(`OpenClaw config maximum include depth (${MAX_INCLUDE_DEPTH}) exceeded at ${includePath}.`);
    }

    const resolvedPath = resolveIncludedFilePath(this.basePath, includePath, this.rootDir);
    const normalizedPath = path.normalize(resolvedPath);

    if (this.visited.has(normalizedPath)) {
      throw new Error(`OpenClaw config circular $include detected: ${[...this.visited, normalizedPath].join(' -> ')}`);
    }

    const nextProcessor = new IncludeProcessor(
      normalizedPath,
      this.rootDir,
      this.depth + 1,
      this.visited,
    );

    return nextProcessor.process(parseConfigFile(readFileSync(normalizedPath, 'utf8')));
  }
}

function resolveIncludedFilePath(basePath: string, includePath: string, rootDir: string): string {
  const resolvedPath = path.isAbsolute(includePath)
    ? path.resolve(includePath)
    : path.resolve(path.dirname(basePath), includePath);

  if (!isPathInside(rootDir, resolvedPath)) {
    throw new Error(`OpenClaw config $include path escapes the config root: ${includePath}`);
  }

  return resolvedPath;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source];
  }

  if (isPlainObject(target) && isPlainObject(source)) {
    const result: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
      result[key] = key in result ? deepMerge(result[key], value) : value;
    }
    return result;
  }

  return source;
}

function isPathInside(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(rootDir), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
