export const PACKAGE_FORMAT_VERSION = 2;
export const MIN_READABLE_FORMAT_VERSION = 1;
export const PACKAGE_TYPE = 'openclaw-agent-template';
export const EXPORT_MODE = 'template';

export const REQUIRED_WORKSPACE_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'TOOLS.md',
] as const;

export const OPTIONAL_WORKSPACE_FILES = [
  'BOOT.md',
  'BOOTSTRAP.md',
  'HEARTBEAT.md',
  'MEMORY.md',
  'memory.md',
] as const;

export const OPENCLAW_BOOTSTRAP_FILES = new Set([
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
  'MEMORY.md',
  'memory.md',
]);

export const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.openclaw',
  'node_modules',
]);

export interface ExclusionPattern {
  test: (relativePath: string, name: string) => boolean;
  reason: string;
  dirOnly?: boolean;
}

export const EXCLUDED_PATTERNS: ExclusionPattern[] = [
  {
    test: (relativePath) => /^memory\/.*\.md$/.test(relativePath),
    reason: 'Excluded by clawpack default policy: daily memory logs are not exported by default',
  },
];

export const SKILLS_MODE = 'topology-snapshot' as const;

export const SKILL_ROOT_PRECEDENCE = {
  workspace: 70,
  projectAgent: 60,
  personalAgent: 50,
  managed: 40,
  bundled: 30,
  extraDir: 20,
  pluginProvided: 20,
} as const;

export const RUNTIME_GROUNDED_ARTIFACTS: string[] = [
  'models.json',
];

export const RUNTIME_INFERRED_ARTIFACTS: string[] = [
  'settings.json',
  'prompts/**',
  'themes/**',
];

export const RUNTIME_UNSUPPORTED_ARTIFACTS: string[] = [
  'skills/**',
  'extensions/**',
];

export const RUNTIME_ALWAYS_EXCLUDE: string[] = [
  'auth-profiles.json',
  'auth.json',
  'sessions/**',
  '.git/**',
  'npm/**',
  'node_modules/**',
  'bin/**',
  'tools/**',
  'caches/**',
  'logs/**',
];

export const RUNTIME_EXCLUDE_EXTENSIONS: string[] = [
  '.log',
  '.lock',
  '.tmp',
  '.bak',
  '.swp',
  '.pid',
];
