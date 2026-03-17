import path from 'node:path';
import { EXPORT_MODE, PACKAGE_FORMAT_VERSION, PACKAGE_TYPE, SKILLS_MODE } from './constants';
import type {
  AgentDefinition,
  ExportArtifacts,
  ExportReport,
  PackageManifest,
  SkillsManifest,
  WorkspaceScanResult,
} from './types';

export function buildManifest(params: {
  packageName: string;
  workspacePath: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
}): PackageManifest {
  const workspaceName = path.basename(params.workspacePath);
  return {
    formatVersion: PACKAGE_FORMAT_VERSION,
    packageType: PACKAGE_TYPE,
    name: params.packageName,
    exportMode: EXPORT_MODE,
    source: {
      agentId: params.agentDefinition.agent.suggestedId,
      workspaceName,
      openclawVersion: 'unknown',
    },
    includes: {
      workspaceFiles: params.scan.includedFiles.map((file) => file.relativePath),
      dailyMemory: false,
      skills: SKILLS_MODE,
      agentDefinition: true,
    },
    excludes: {
      secrets: true,
      sessionState: true,
      channelBindings: true,
      globalExtensions: true,
    },
    compatibility: {
      minFormatVersion: PACKAGE_FORMAT_VERSION,
      notes: params.skills.notes,
    },
  };
}

export function buildExportReport(params: {
  packageName: string;
  workspacePath: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  warnings?: string[];
}): ExportReport {
  return {
    packageName: params.packageName,
    workspacePath: params.workspacePath,
    includedFiles: params.scan.includedFiles.map((file) => file.relativePath),
    excludedFiles: params.scan.excludedFiles,
    ignoredFiles: params.scan.ignoredFiles,
    warnings: params.warnings ?? [],
    skills: params.skills,
  };
}

export function buildExportArtifacts(params: {
  packageName: string;
  workspacePath: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
  checksums: Record<string, string>;
  warnings?: string[];
}): ExportArtifacts {
  return {
    manifest: buildManifest(params),
    checksums: params.checksums,
    exportReport: buildExportReport(params),
  };
}
