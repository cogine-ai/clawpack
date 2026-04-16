export interface IncludedWorkspaceFile {
  relativePath: string;
  absolutePath: string;
  isBootstrap: boolean;
}

export interface ExcludedWorkspaceFile {
  relativePath: string;
  reason: string;
}

export interface WorkspaceScanResult {
  workspacePath: string;
  includedFiles: IncludedWorkspaceFile[];
  excludedFiles: ExcludedWorkspaceFile[];
}

export type SkillsMode = 'topology-snapshot';
export type SkillPortability = 'portable' | 'host-bound' | 'reinstall-required' | 'unsupported';
export type SkillRootKind =
  | 'workspace'
  | 'project-agent'
  | 'personal-agent'
  | 'managed'
  | 'bundled'
  | 'extra-dir'
  | 'plugin-provided';
export type SkillResolutionStatus = 'visible' | 'shadowed' | 'filtered-out' | 'disabled';

export interface SkillRootSnapshot {
  id: string;
  kind: SkillRootKind;
  source: string;
  precedence: number;
  path?: string;
  exists: boolean;
  portability: SkillPortability;
  skillKeys: string[];
  notes: string[];
}

export interface SkillAllowlistSnapshot {
  mode: 'unrestricted' | 'allowlist';
  values: string[];
  source: string;
  portability: SkillPortability;
  notes: string[];
}

export interface SkillEntryConfigSnapshot {
  skillKey: string;
  enabled?: boolean;
  envKeys: string[];
  apiKeySource?: 'env' | 'literal' | 'unknown';
  portability: SkillPortability;
  notes: string[];
}

export interface SkillOccurrenceSnapshot {
  rootId: string;
  rootKind: SkillRootKind;
  path?: string;
  portability: SkillPortability;
}

export interface SkillResolutionSnapshot {
  skillKey: string;
  status: SkillResolutionStatus;
  portability: SkillPortability;
  source?: SkillOccurrenceSnapshot;
  shadowed: SkillOccurrenceSnapshot[];
  notes: string[];
}

export interface SkillsManifest {
  mode: SkillsMode;
  roots: SkillRootSnapshot[];
  allowlist: SkillAllowlistSnapshot;
  entries: SkillEntryConfigSnapshot[];
  effectiveSkills: SkillResolutionSnapshot[];
  notes: string[];
}

export interface AgentToolsConfig {
  profile?: string;
  allow?: string[];
  alsoAllow?: string[];
  deny?: string[];
  byProvider?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentDefinition {
  agent: {
    suggestedId: string;
    suggestedName: string;
    workspace: {
      suggestedBasename: string;
    };
    identity: {
      name: string;
      [key: string]: unknown;
    };
    model?: {
      default: string;
      fallbacks?: string[];
      [key: string]: unknown;
    };
    tools?: AgentToolsConfig;
    skills?: string[];
    heartbeat?: Record<string, unknown>;
    sandbox?: Record<string, unknown>;
    runtime?: Record<string, unknown>;
    params?: Record<string, unknown>;
    subagents?: Record<string, unknown>;
    groupChat?: Record<string, unknown>;
    humanDelay?: Record<string, unknown>;
    memorySearch?: Record<string, unknown>;
  };
  fieldClassification: Record<string, 'portable' | 'requiresInputOnImport' | 'excluded'>;
  notes: string[];
}

export interface AgentBindingDefinition {
  type?: 'route' | 'acp';
  agentId: string;
  comment?: string;
  match: {
    channel: string;
    accountId?: string;
    peer?: { kind: string; id: string };
    guildId?: string;
    teamId?: string;
    roles?: string[];
  };
  acp?: Record<string, unknown>;
}

/** All fields optional: clawpack transports cron definitions as-is from the source config without runtime validation. */
export interface CronJobDefinition {
  agentId?: string;
  schedule?: string;
  sessionTarget?: string;
  payload?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ImportHints {
  requiredInputs: Array<{
    key: 'agentId' | 'targetWorkspacePath';
    reason: string;
  }>;
  warnings: string[];
}

export interface PackageManifest {
  formatVersion: number;
  packageType: string;
  name: string;
  exportMode: string;
  source: {
    agentId: string;
    workspaceName: string;
    openclawVersion?: string;
  };
  metadata?: {
    createdAt: string;
    createdBy: {
      name: string;
      version: string;
    };
    platform: {
      os: NodeJS.Platform;
      arch: string;
      node: string;
    };
    contentHash: string;
  };
  includes: {
    workspaceFiles: string[];
    bootstrapFiles?: string[];
    dailyMemory: boolean;
    skills: SkillsMode;
    agentDefinition: boolean;
    bindings?: boolean;
    cronJobs?: boolean;
    runtimeMode?: RuntimeMode;
    runtimeFiles?: string[];
  };
  excludes: {
    secrets: boolean;
    sessionState: boolean;
    channelBindings?: boolean;
    globalExtensions?: boolean;
    connectionState?: boolean;
  };
  compatibility: {
    minFormatVersion: number;
    notes: string[];
  };
}

export interface ExportReport {
  packageName: string;
  workspacePath: string;
  includedFiles: string[];
  bootstrapFiles: string[];
  excludedFiles: ExcludedWorkspaceFile[];
  warnings: string[];
  skills: SkillsManifest;
  runtime?: RuntimeManifest;
}

export interface ExportArtifacts {
  manifest: PackageManifest;
  checksums: Record<string, string>;
  exportReport: ExportReport;
}

export interface ExportPackageInput {
  sourceWorkspacePath: string;
  outputPath: string;
  packageName?: string;
}

export interface ExportPackageResult {
  packageRoot: string;
  manifestPath: string;
  fileCount: number;
}

export interface ReadPackageResult {
  packageRoot: string;
  manifest: PackageManifest;
  agentDefinition: AgentDefinition;
  skillsManifest: SkillsManifest;
  importHints: ImportHints;
  checksums: Record<string, string>;
  exportReport: ExportReport;
  workspaceFiles: Array<{
    relativePath: string;
    absolutePath: string;
  }>;
  bindings?: AgentBindingDefinition[];
  cronJobs?: CronJobDefinition[];
  runtimeManifest?: RuntimeManifest;
}

export interface RuntimeWritePlan {
  files: Array<{
    sourcePath: string;
    targetPath: string;
    relativePath: string;
  }>;
  targetAgentDir: string;
  sourceAgentDir: string;
  sourceWorkspacePath: string;
  pathRewrites: PathRewrite[];
  overwriteExisting: boolean;
}

export interface PathRewrite {
  key: string;
  originalValue: string;
  rewrittenValue: string;
  classification: SettingsPathClassification;
}

export interface ImportWritePlan {
  workspaceFiles: Array<{
    sourcePath: string;
    targetPath: string;
    relativePath: string;
  }>;
  overwriteExisting: boolean;
  targetWorkspacePath: string;
  targetAgentId: string;
  metadataDirectory: string;
  targetConfigPath?: string;
  runtimePlan?: RuntimeWritePlan;
  summary: {
    fileCount: number;
    existingWorkspaceDetected: boolean;
    targetConfigDetected: boolean;
    configAgentCollision: boolean;
    runtimeFileCount: number;
    runtimeCollisions: boolean;
    targetAgentDirDetected: boolean;
  };
}

interface ImportPlanBase {
  requiredInputs: ImportHints['requiredInputs'];
  warnings: string[];
  failed: string[];
  nextSteps: string[];
  writePlan: ImportWritePlan;
}

export interface BlockedImportPlan extends ImportPlanBase {
  canProceed: false;
}

export interface ExecutableImportPlan extends ImportPlanBase {
  canProceed: true;
  requiredInputs: [];
  failed: [];
}

export type ImportPlan = BlockedImportPlan | ExecutableImportPlan;

export interface ImportResult {
  status: 'ok';
  importedFiles: string[];
  importedRuntimeFiles: string[];
  metadataFiles: string[];
  warnings: string[];
  nextSteps: string[];
  targetWorkspacePath: string;
  targetAgentDir?: string;
  agentId: string;
  expectedChecksums: Record<string, string>;
}

export interface ValidationReport {
  passed: string[];
  warnings: string[];
  failed: string[];
  nextSteps: string[];
}

export type RuntimeMode = 'none' | 'default' | 'full';

export interface RuntimeArtifactBuckets {
  grounded: string[];
  inferred: string[];
  unsupported: string[];
}

export interface RuntimeScanResult {
  mode: RuntimeMode;
  agentDir: string;
  includedFiles: Array<{ relativePath: string; absolutePath: string }>;
  excludedFiles: ExcludedWorkspaceFile[];
  artifacts: RuntimeArtifactBuckets;
  warnings: string[];
  sanitizedModels: Record<string, unknown> | undefined;
  settingsAnalysis: SettingsAnalysis | undefined;
}

export interface RuntimeManifest {
  mode: RuntimeMode;
  agentDir: string;
  includedFiles: string[];
  excludedFiles: ExcludedWorkspaceFile[];
  artifacts: RuntimeArtifactBuckets;
  warnings: string[];
  modelsSanitized: boolean;
  modelsSkipped: boolean;
  settingsAnalysisIncluded: boolean;
}

export type SettingsPathClassification =
  | 'package-internal-workspace'
  | 'package-internal-agentDir'
  | 'relative'
  | 'external-absolute'
  | 'host-bound';

export interface SettingsPathRef {
  key: string;
  value: string;
  classification: SettingsPathClassification;
}

export interface SettingsAnalysis {
  pathRefs: SettingsPathRef[];
  summary: {
    total: number;
    packageInternalWorkspace: number;
    packageInternalAgentDir: number;
    relative: number;
    externalAbsolute: number;
    hostBound: number;
  };
}
