import path from 'node:path';
import packageJson from '../../package.json';
import { checksumText } from './checksums';
import { EXPORT_MODE, PACKAGE_FORMAT_VERSION, PACKAGE_TYPE, SKILLS_MODE } from './constants';
import type {
  AgentDefinition,
  ExportArtifacts,
  ExportReport,
  PackageManifest,
  RuntimeManifest,
  RuntimeScanResult,
  SkillsManifest,
  WorkspaceScanResult,
} from './types';

export function buildManifest(params: {
  packageName: string;
  workspacePath: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
  openclawVersion?: string;
  metadata?: PackageManifest['metadata'];
  checksums?: Record<string, string>;
  hasCronJobs?: boolean;
  runtimeScan?: RuntimeScanResult;
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
      openclawVersion: params.openclawVersion ?? 'unknown',
    },
    metadata: params.metadata ?? buildPackageMetadata(params.checksums ?? {}),
    includes: {
      workspaceFiles: params.scan.includedFiles.map((file) => file.relativePath),
      bootstrapFiles: params.scan.includedFiles
        .filter((file) => file.isBootstrap)
        .map((file) => file.relativePath),
      dailyMemory: false,
      skills: SKILLS_MODE,
      agentDefinition: true,
      cronJobs: params.hasCronJobs ?? false,
      runtimeMode: params.runtimeScan?.mode,
      runtimeFiles: params.runtimeScan?.includedFiles.map(f => f.relativePath),
    },
    excludes: {
      secrets: true,
      sessionState: true,
      connectionState: true,
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
  runtimeManifest?: RuntimeManifest;
}): ExportReport {
  return {
    packageName: params.packageName,
    workspacePath: params.workspacePath,
    includedFiles: params.scan.includedFiles.map((file) => file.relativePath),
    bootstrapFiles: params.scan.includedFiles
      .filter((file) => file.isBootstrap)
      .map((file) => file.relativePath),
    excludedFiles: params.scan.excludedFiles,
    warnings: params.warnings ?? [],
    skills: params.skills,
    runtime: params.runtimeManifest,
  };
}

export function buildExportArtifacts(params: {
  packageName: string;
  workspacePath: string;
  scan: WorkspaceScanResult;
  skills: SkillsManifest;
  agentDefinition: AgentDefinition;
  openclawVersion?: string;
  checksums: Record<string, string>;
  warnings?: string[];
  hasCronJobs?: boolean;
  runtimeScan?: RuntimeScanResult;
  runtimeManifest?: RuntimeManifest;
}): ExportArtifacts {
  return {
    manifest: buildManifest(params),
    checksums: params.checksums,
    exportReport: buildExportReport(params),
  };
}

function buildPackageMetadata(checksums: Record<string, string>): NonNullable<PackageManifest['metadata']> {
  return {
    createdAt: new Date().toISOString(),
    createdBy: {
      name: packageJson.name,
      version: packageJson.version,
    },
    platform: {
      os: process.platform,
      arch: process.arch,
      node: process.version,
    },
    contentHash: checksumText(JSON.stringify(Object.entries(checksums).sort(([left], [right]) => left.localeCompare(right)))),
  };
}
