export interface IncludedWorkspaceFile {
  relativePath: string;
  absolutePath: string;
  required: boolean;
}

export interface ExcludedWorkspaceFile {
  relativePath: string;
  reason: string;
}

export interface WorkspaceScanResult {
  workspacePath: string;
  includedFiles: IncludedWorkspaceFile[];
  excludedFiles: ExcludedWorkspaceFile[];
  missingOptionalFiles: string[];
  ignoredFiles: string[];
}

export interface SkillsManifest {
  mode: 'manifest-only';
  workspaceSkills: string[];
  referencedSkills: string[];
  notes: string[];
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
    };
    model?: {
      default: string;
    };
  };
  fieldClassification: Record<string, 'portable' | 'requiresInputOnImport' | 'excluded'>;
  notes: string[];
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
    openclawVersion: string;
  };
  includes: {
    workspaceFiles: string[];
    dailyMemory: boolean;
    skills: 'manifest-only';
    agentDefinition: boolean;
  };
  excludes: {
    secrets: boolean;
    sessionState: boolean;
    channelBindings: boolean;
    globalExtensions: boolean;
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
  excludedFiles: ExcludedWorkspaceFile[];
  ignoredFiles: string[];
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

export interface ImportPlan {
  canProceed: boolean;
  requiredInputs: ImportHints['requiredInputs'];
  warnings: string[];
  failed: string[];
  nextSteps: string[];
  writePlan: ImportWritePlan;
}

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
