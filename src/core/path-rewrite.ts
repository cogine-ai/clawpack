import type { PathRewrite, SettingsAnalysis } from './types';

export function computePathRewrites(params: {
  settingsAnalysis: SettingsAnalysis;
  sourceWorkspacePath: string;
  sourceAgentDir: string;
  targetWorkspacePath: string;
  targetAgentDir: string;
}): { rewrites: PathRewrite[]; blocked: PathRewrite[]; warnings: string[] } {
  const rewrites: PathRewrite[] = [];
  const blocked: PathRewrite[] = [];
  const warnings: string[] = [];

  for (const ref of params.settingsAnalysis.pathRefs) {
    switch (ref.classification) {
      case 'package-internal-agentDir': {
        const rewritten = params.targetAgentDir + ref.value.slice(params.sourceAgentDir.length);
        rewrites.push({
          key: ref.key,
          originalValue: ref.value,
          rewrittenValue: rewritten,
          classification: ref.classification,
        });
        break;
      }
      case 'package-internal-workspace': {
        const rewritten =
          params.targetWorkspacePath + ref.value.slice(params.sourceWorkspacePath.length);
        rewrites.push({
          key: ref.key,
          originalValue: ref.value,
          rewrittenValue: rewritten,
          classification: ref.classification,
        });
        break;
      }
      case 'relative':
        break;
      case 'external-absolute':
        blocked.push({
          key: ref.key,
          originalValue: ref.value,
          rewrittenValue: ref.value,
          classification: ref.classification,
        });
        warnings.push(
          `External absolute path in settings.json cannot be auto-rewritten: ${ref.key} = ${ref.value}`,
        );
        break;
      case 'host-bound':
        warnings.push(
          `Host-bound path in settings.json may not work on target system: ${ref.key} = ${ref.value}`,
        );
        break;
    }
  }

  return { rewrites, blocked, warnings };
}

/**
 * Walks a parsed settings object and replaces source workspace/agentDir
 * prefixes with their target equivalents. AgentDir is checked first since
 * it may be a child of the workspace path.
 */
export function applyPathRewrites(
  settings: Record<string, unknown>,
  sourceWorkspacePath: string,
  sourceAgentDir: string,
  targetWorkspacePath: string,
  targetAgentDir: string,
): Record<string, unknown> {
  return rewriteValue(
    settings,
    sourceWorkspacePath,
    sourceAgentDir,
    targetWorkspacePath,
    targetAgentDir,
  ) as Record<string, unknown>;
}

function rewriteValue(
  value: unknown,
  srcWs: string,
  srcAd: string,
  tgtWs: string,
  tgtAd: string,
): unknown {
  if (typeof value === 'string') {
    if (value.startsWith(`${srcAd}/`) || value === srcAd) {
      return tgtAd + value.slice(srcAd.length);
    }
    if (value.startsWith(`${srcWs}/`) || value === srcWs) {
      return tgtWs + value.slice(srcWs.length);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteValue(item, srcWs, srcAd, tgtWs, tgtAd));
  }

  if (typeof value === 'object' && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = rewriteValue(child, srcWs, srcAd, tgtWs, tgtAd);
    }
    return result;
  }

  return value;
}
