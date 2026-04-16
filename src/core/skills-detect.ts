import { access, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import JSON5 from 'json5';
import { SKILL_ROOT_PRECEDENCE, SKILLS_MODE } from './constants';
import {
  loadOpenClawConfig,
  resolveAgentContextForWorkspace,
  type MinimalOpenClawConfig,
} from './openclaw-config';
import type {
  SkillAllowlistSnapshot,
  SkillEntryConfigSnapshot,
  SkillOccurrenceSnapshot,
  SkillPortability,
  SkillResolutionSnapshot,
  SkillRootKind,
  SkillRootSnapshot,
  SkillsManifest,
  WorkspaceScanResult,
} from './types';

interface DetectSkillsOptions {
  configPath?: string;
  agentId?: string;
  homePath?: string;
}

interface RootSpec {
  id: string;
  kind: SkillRootKind;
  source: string;
  precedence: number;
  path?: string;
  skillKeys?: string[];
  portability: SkillPortability;
  notes?: string[];
}

interface PluginManifest {
  id?: string;
  skills?: unknown;
  skillsDirs?: unknown;
}

export async function detectSkills(
  scan: WorkspaceScanResult,
  options: DetectSkillsOptions = {},
): Promise<SkillsManifest> {
  const loaded = await tryLoadConfig(scan.workspacePath, options.configPath);
  const config = loaded?.config;
  const configPath = loaded?.configPath;
  const homePath = resolveHomePath(options.homePath);
  const stateDir = resolveStateDir(homePath, configPath);

  const agentContext =
    config && configPath
      ? resolveAgentContextForWorkspace({
          config,
          configPath,
          workspacePath: scan.workspacePath,
          agentId: options.agentId,
        })
      : undefined;

  const allowlist = resolveAllowlist(config, agentContext);
  const entrySnapshots = resolveEntrySnapshots(config);
  const rootSpecs = await collectRootSpecs({
    workspacePath: scan.workspacePath,
    homePath,
    stateDir,
    config,
    configPath,
  });

  const roots = await Promise.all(rootSpecs.map((root) => hydrateRoot(root)));
  const entriesBySkill = new Map(entrySnapshots.map((entry) => [entry.skillKey, entry]));
  const occurrencesBySkill = new Map<string, SkillOccurrenceSnapshot[]>();

  for (const root of roots) {
    for (const skillKey of root.skillKeys) {
      const current = occurrencesBySkill.get(skillKey) ?? [];
      current.push({
        rootId: root.id,
        rootKind: root.kind,
        path: root.path,
        portability: root.portability,
      });
      occurrencesBySkill.set(skillKey, current);
    }
  }

  const effectiveSkills = [...occurrencesBySkill.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([skillKey, occurrences]) =>
      resolveSkillSnapshot(skillKey, occurrences, allowlist, entriesBySkill.get(skillKey)),
    );

  const notes = [
    'Skill topology is a source-backed snapshot of roots, per-agent filters, and skills.entries config.',
    'Workspace and project-agent skills are portable when their winning implementation lives under the exported workspace.',
    'Managed, personal, extra-dir, bundled, and plugin-provided skills are not packaged; reinstall them on the target host when needed.',
  ];

  if (!config || !configPath) {
    notes.push('OpenClaw config was not resolved; the snapshot is limited to default roots discoverable from the current host.');
  }

  return {
    mode: SKILLS_MODE,
    roots,
    allowlist,
    entries: entrySnapshots,
    effectiveSkills,
    notes,
  };
}

async function tryLoadConfig(
  workspacePath: string,
  configPath?: string,
): Promise<{ configPath: string; config: MinimalOpenClawConfig } | undefined> {
  try {
    return await loadOpenClawConfig({ configPath, cwd: workspacePath });
  } catch {
    return undefined;
  }
}

function resolveHomePath(override?: string): string {
  if (override) return path.resolve(override);
  return homedir() ? path.resolve(homedir()) : path.resolve('.');
}

function resolveStateDir(homePath: string, configPath?: string): string {
  const explicitStateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (explicitStateDir) return path.resolve(explicitStateDir);
  if (configPath) return path.dirname(configPath);
  return path.join(homePath, '.openclaw');
}

function resolveAllowlist(
  config: MinimalOpenClawConfig | undefined,
  agentContext: ReturnType<typeof resolveAgentContextForWorkspace>,
): SkillAllowlistSnapshot {
  if (!config || !agentContext) {
    return {
      mode: 'unrestricted',
      values: [],
      source: 'none',
      portability: 'host-bound',
      notes: ['No resolved OpenClaw agent context; all discovered skills are treated as potentially visible.'],
    };
  }

  const values = Array.isArray(agentContext.effectiveAgent.skills)
    ? [...new Set(agentContext.effectiveAgent.skills.filter((value): value is string => typeof value === 'string'))]
    : [];

  if (values.length === 0) {
    return {
      mode: 'unrestricted',
      values: [],
      source: 'none',
      portability: 'host-bound',
      notes: ['The resolved source agent does not define a skills allowlist.'],
    };
  }

  const source = agentContext.entry.source === 'legacy-agent'
    ? 'agent.skills'
    : Array.isArray(agentContext.entry.agent.skills)
      ? `agents.list[${agentContext.entry.resolvedId}].skills`
      : Array.isArray(config.agents?.defaults?.skills)
        ? 'agents.defaults.skills'
        : 'agent.skills';

  return {
    mode: 'allowlist',
    values: values.sort(),
    source,
    portability: 'host-bound',
    notes: ['OpenClaw applies this allowlist after merging all visible skill roots.'],
  };
}

function resolveEntrySnapshots(config: MinimalOpenClawConfig | undefined): SkillEntryConfigSnapshot[] {
  const entries = config?.skills?.entries;
  if (!entries || typeof entries !== 'object') return [];

  return Object.entries(entries)
    .map(([skillKey, rawEntry]) => {
      const record = isPlainObject(rawEntry) ? rawEntry : {};
      const enabled = typeof record.enabled === 'boolean' ? record.enabled : undefined;
      const envKeys = isPlainObject(record.env) ? Object.keys(record.env).sort() : [];
      let apiKeySource: SkillEntryConfigSnapshot['apiKeySource'];
      if (record.apiKey !== undefined) {
        if (typeof record.apiKey === 'string') {
          apiKeySource = 'literal';
        } else if (isPlainObject(record.apiKey)) {
          apiKeySource = 'env';
        } else {
          apiKeySource = 'unknown';
        }
      }

      const notes: string[] = [];
      if (enabled !== undefined) {
        notes.push(enabled ? 'Skill is explicitly enabled in skills.entries.' : 'Skill is explicitly disabled in skills.entries.');
      }
      if (envKeys.length > 0) {
        notes.push(`Injects host env keys: ${envKeys.join(', ')}.`);
      }
      if (apiKeySource) {
        notes.push(`Configures apiKey via ${apiKeySource}.`);
      }

      return {
        skillKey,
        enabled,
        envKeys,
        apiKeySource,
        portability: 'host-bound' as const,
        notes,
      };
    })
    .sort((left, right) => left.skillKey.localeCompare(right.skillKey));
}

async function collectRootSpecs(params: {
  workspacePath: string;
  homePath: string;
  stateDir: string;
  config?: MinimalOpenClawConfig;
  configPath?: string;
}): Promise<RootSpec[]> {
  const roots: RootSpec[] = [
    {
      id: 'workspace',
      kind: 'workspace',
      source: 'workspace/skills',
      precedence: SKILL_ROOT_PRECEDENCE.workspace,
      path: path.join(params.workspacePath, 'skills'),
      portability: 'portable',
    },
    {
      id: 'project-agent',
      kind: 'project-agent',
      source: 'workspace/.agents/skills',
      precedence: SKILL_ROOT_PRECEDENCE.projectAgent,
      path: path.join(params.workspacePath, '.agents', 'skills'),
      portability: 'portable',
    },
    {
      id: 'personal-agent',
      kind: 'personal-agent',
      source: '~/.agents/skills',
      precedence: SKILL_ROOT_PRECEDENCE.personalAgent,
      path: path.join(params.homePath, '.agents', 'skills'),
      portability: 'host-bound',
    },
    {
      id: 'managed',
      kind: 'managed',
      source: 'OPENCLAW_STATE_DIR/skills',
      precedence: SKILL_ROOT_PRECEDENCE.managed,
      path: path.join(params.stateDir, 'skills'),
      portability: 'host-bound',
    },
    {
      id: 'bundled',
      kind: 'bundled',
      source: 'skills.allowBundled',
      precedence: SKILL_ROOT_PRECEDENCE.bundled,
      skillKeys: resolveBundledSkillKeys(params.config),
      portability: 'host-bound',
      notes: resolveBundledRootNotes(params.config),
    },
  ];

  const extraDirs = resolveExtraDirs(params.config, params.configPath);
  roots.push(
    ...extraDirs.map((dirPath, index) => ({
      id: `extra-dir:${index + 1}`,
      kind: 'extra-dir' as const,
      source: `skills.load.extraDirs[${index}]`,
      precedence: SKILL_ROOT_PRECEDENCE.extraDir,
      path: dirPath,
      portability: 'host-bound' as const,
    })),
  );

  const pluginRoots = await resolvePluginRoots({
    workspacePath: params.workspacePath,
    stateDir: params.stateDir,
    config: params.config,
    configPath: params.configPath,
  });
  roots.push(...pluginRoots);

  return roots;
}

function resolveBundledRootNotes(config: MinimalOpenClawConfig | undefined): string[] {
  const allowBundled = resolveBundledSkillKeys(config);

  const notes = [
    'Bundled skills are provided by the host OpenClaw install and are not packaged by clawpack.',
  ];

  if (allowBundled.length > 0) {
    notes.push(`Bundled gate allows: ${allowBundled.sort().join(', ')}.`);
  } else {
    notes.push('No explicit skills.allowBundled gate is configured.');
  }

  return notes;
}

function resolveBundledSkillKeys(config: MinimalOpenClawConfig | undefined): string[] {
  return Array.isArray(config?.skills?.allowBundled)
    ? config!.skills!.allowBundled!
        .filter((value): value is string => typeof value === 'string')
        .sort()
    : [];
}

function resolveExtraDirs(
  config: MinimalOpenClawConfig | undefined,
  configPath?: string,
): string[] {
  const rawDirs = config?.skills?.load?.extraDirs;
  if (!Array.isArray(rawDirs)) return [];

  return rawDirs
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => resolveConfigPath(value, configPath));
}

async function resolvePluginRoots(params: {
  workspacePath: string;
  stateDir: string;
  config?: MinimalOpenClawConfig;
  configPath?: string;
}): Promise<RootSpec[]> {
  if (params.config?.plugins?.enabled === false) {
    return [];
  }

  const pluginCandidates = [
    ...resolvePluginLoadPaths(params.config, params.configPath).map((candidate) => ({
      path: candidate,
      origin: 'config-path' as const,
    })),
    {
      path: path.join(params.workspacePath, '.openclaw', 'extensions'),
      origin: 'workspace' as const,
    },
    {
      path: path.join(params.stateDir, 'extensions'),
      origin: 'managed' as const,
    },
  ];

  const manifests = new Map<string, { rootPath: string; manifest: PluginManifest; origin: 'config-path' | 'workspace' | 'managed' }>();
  for (const candidate of pluginCandidates) {
    for (const manifest of await discoverPluginManifests(candidate.path)) {
      if (!manifest.manifest.id || manifests.has(manifest.manifest.id)) continue;
      manifests.set(manifest.manifest.id, {
        ...manifest,
        origin: candidate.origin,
      });
    }
  }

  const allow = toStringSet(params.config?.plugins?.allow);
  const deny = toStringSet(params.config?.plugins?.deny);
  const entries = isPlainObject(params.config?.plugins?.entries)
    ? (params.config!.plugins!.entries as Record<string, Record<string, unknown>>)
    : {};

  const roots: RootSpec[] = [];

  for (const [pluginId, manifestData] of [...manifests.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const entry = isPlainObject(entries[pluginId]) ? entries[pluginId] : {};
    const explicitlyEnabled = typeof entry.enabled === 'boolean' ? entry.enabled : undefined;
    const allowed = allow.size === 0 || allow.has(pluginId);
    const denied = deny.has(pluginId);
    const workspacePluginNeedsEnable = manifestData.origin === 'workspace' && explicitlyEnabled !== true;
    const enabled = explicitlyEnabled !== false && allowed && !denied && !workspacePluginNeedsEnable;

    if (!enabled) continue;

    const skillDirs = resolvePluginSkillDirs(manifestData.rootPath, manifestData.manifest);
    roots.push(
      ...skillDirs.map((skillDir, index) => ({
        id: `plugin:${pluginId}:${index + 1}`,
        kind: 'plugin-provided' as const,
        source: `plugins.${pluginId}`,
        precedence: SKILL_ROOT_PRECEDENCE.pluginProvided,
        path: skillDir,
        portability: 'host-bound' as const,
        notes: [`Plugin-provided skills from ${pluginId}.`],
      })),
    );
  }

  return roots;
}

function resolvePluginLoadPaths(
  config: MinimalOpenClawConfig | undefined,
  configPath?: string,
): string[] {
  const rawPaths = config?.plugins?.load?.paths;
  if (!Array.isArray(rawPaths)) return [];

  return rawPaths
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => resolveConfigPath(value, configPath));
}

function resolvePluginSkillDirs(rootPath: string, manifest: PluginManifest): string[] {
  const rawDirs = Array.isArray(manifest.skills)
    ? manifest.skills
    : Array.isArray(manifest.skillsDirs)
      ? manifest.skillsDirs
      : [];

  return rawDirs
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => path.resolve(rootPath, value));
}

async function discoverPluginManifests(candidatePath: string): Promise<Array<{ rootPath: string; manifest: PluginManifest }>> {
  const manifestPath = await resolvePluginManifestPath(candidatePath);
  if (manifestPath) {
    const manifest = await readPluginManifest(manifestPath);
    return manifest ? [{ rootPath: path.dirname(manifestPath), manifest }] : [];
  }

  let entries: string[];
  try {
    entries = await readdir(candidatePath);
  } catch {
    return [];
  }

  const manifests: Array<{ rootPath: string; manifest: PluginManifest }> = [];
  for (const entry of entries.sort((left, right) => left.localeCompare(right))) {
    const childManifestPath = await resolvePluginManifestPath(path.join(candidatePath, entry));
    if (!childManifestPath) continue;
    const manifest = await readPluginManifest(childManifestPath);
    if (manifest) {
      manifests.push({ rootPath: path.dirname(childManifestPath), manifest });
    }
  }

  return manifests;
}

async function resolvePluginManifestPath(candidatePath: string): Promise<string | undefined> {
  const manifestFile = candidatePath.endsWith('openclaw.plugin.json')
    ? candidatePath
    : path.join(candidatePath, 'openclaw.plugin.json');

  try {
    await access(manifestFile);
    return manifestFile;
  } catch {
    return undefined;
  }
}

async function readPluginManifest(manifestPath: string): Promise<PluginManifest | undefined> {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON5.parse(raw);
    return isPlainObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function hydrateRoot(spec: RootSpec): Promise<SkillRootSnapshot> {
  if (!spec.path) {
    const skillKeys = spec.skillKeys ?? [];
    return {
      id: spec.id,
      kind: spec.kind,
      source: spec.source,
      precedence: spec.precedence,
      exists: skillKeys.length > 0,
      portability: spec.portability,
      skillKeys,
      notes: spec.notes ?? [],
    };
  }

  const exists = await pathExists(spec.path);
  const skillKeys = exists ? await collectSkillKeys(spec.path) : [];

  return {
    id: spec.id,
    kind: spec.kind,
    source: spec.source,
    precedence: spec.precedence,
    path: spec.path,
    exists,
    portability: spec.portability,
    skillKeys,
    notes: spec.notes ?? [],
  };
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectSkillKeys(rootPath: string): Promise<string[]> {
  let dirents;
  try {
    dirents = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const skillKeys = new Set<string>();
  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(rootPath, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!(await pathExists(skillFile))) continue;
    const skillKey = await readSkillKey(skillFile, entry.name);
    if (skillKey) {
      skillKeys.add(skillKey);
    }
  }

  return [...skillKeys].sort();
}

async function readSkillKey(skillFile: string, fallbackName: string): Promise<string> {
  try {
    const content = await readFile(skillFile, 'utf8');
    const frontmatter = extractFrontmatter(content);
    if (frontmatter) {
      const match = frontmatter.match(/^\s*skillKey\s*:\s*["']?([^"'\n]+)["']?\s*$/m);
      const configured = match?.[1]?.trim();
      if (configured) return configured;
    }
  } catch {}

  return fallbackName;
}

function extractFrontmatter(content: string): string | undefined {
  if (!content.startsWith('---\n')) return undefined;
  const endMarker = '\n---\n';
  const endIndex = content.indexOf(endMarker, 4);
  if (endIndex === -1) return undefined;
  return content.slice(4, endIndex);
}

function resolveSkillSnapshot(
  skillKey: string,
  occurrences: SkillOccurrenceSnapshot[],
  allowlist: SkillAllowlistSnapshot,
  entry: SkillEntryConfigSnapshot | undefined,
): SkillResolutionSnapshot {
  const [source, ...shadowed] = occurrences;
  const notes = [...(entry?.notes ?? [])];

  if (shadowed.length > 0) {
    notes.push(
      `Shadowed lower-precedence roots: ${shadowed.map((occurrence) => occurrence.rootKind).join(', ')}.`,
    );
  }

  if (entry?.enabled === false) {
    return {
      skillKey,
      status: 'disabled',
      portability: 'unsupported',
      source,
      shadowed,
      notes,
    };
  }

  if (allowlist.mode === 'allowlist' && !allowlist.values.includes(skillKey)) {
    notes.push(`Filtered out by ${allowlist.source}.`);
    return {
      skillKey,
      status: 'filtered-out',
      portability: 'unsupported',
      source,
      shadowed,
      notes,
    };
  }

  const portability = source.portability === 'portable' && !hasHostBoundEntryConfig(entry)
    ? 'portable'
    : source.portability === 'portable'
      ? 'host-bound'
      : 'reinstall-required';

  return {
    skillKey,
    status: 'visible',
    portability,
    source,
    shadowed,
    notes,
  };
}

function hasHostBoundEntryConfig(entry: SkillEntryConfigSnapshot | undefined): boolean {
  return Boolean(entry && (entry.envKeys.length > 0 || entry.apiKeySource));
}

function resolveConfigPath(value: string, configPath?: string): string {
  if (path.isAbsolute(value)) return path.resolve(value);
  if (configPath) return path.resolve(path.dirname(configPath), value);
  return path.resolve(value);
}

function toStringSet(values: unknown): Set<string> {
  return new Set(
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : [],
  );
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
