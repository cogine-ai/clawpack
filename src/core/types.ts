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

export interface SkillsManifest {
  mode: 'manifest-only';
  workspaceSkills: string[];
  referencedSkills: string[];
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
    bootstrapFiles: string[];
    dailyMemory: boolean;
    skills: 'manifest-only';
    agentDefinition: boolean;
    bindings: boolean;
    cronJobs: boolean;
  };
  excludes: {
    secrets: boolean;
    sessionState: boolean;
    connectionState: boolean;
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
  summary: {
    fileCount: number;
    existingWorkspaceDetected: boolean;
    targetConfigDetected: boolean;
    configAgentCollision: boolean;
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
  metadataFiles: string[];
  warnings: string[];
  nextSteps: string[];
  targetWorkspacePath: string;
  agentId: string;
}

export interface ValidationReport {
  passed: string[];
  warnings: string[];
  failed: string[];
  nextSteps: string[];
}
