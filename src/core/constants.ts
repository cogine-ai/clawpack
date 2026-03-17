export const PACKAGE_FORMAT_VERSION = 1;
export const PACKAGE_TYPE = 'openclaw-agent-template';
export const EXPORT_MODE = 'template';

export const REQUIRED_WORKSPACE_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'IDENTITY.md',
  'USER.md',
  'TOOLS.md',
  'MEMORY.md',
] as const;

export const OPTIONAL_WORKSPACE_FILES = ['HEARTBEAT.md'] as const;

export const ALLOWED_WORKSPACE_FILES = [
  ...REQUIRED_WORKSPACE_FILES,
  ...OPTIONAL_WORKSPACE_FILES,
] as const;

export const DEFAULT_EXCLUDED_GLOBS = ['memory/*.md'];

export const SKILLS_MODE = 'manifest-only' as const;

export const SKILL_REFERENCE_PATTERNS = [
  /\b(?:use|using|install|activate|invok(?:e|ing)|requires?)\s+(?:the\s+)?skill\s+`([a-z0-9][a-z0-9-]*)`/gi,
  /skills?\/[A-Za-z0-9._-]+\/([a-z0-9][a-z0-9-]*)\b/gi,
  /<name>([a-z0-9][a-z0-9-]*)<\/name>/gi,
];
