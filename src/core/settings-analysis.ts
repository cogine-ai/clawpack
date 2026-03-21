import type { SettingsAnalysis, SettingsPathClassification, SettingsPathRef } from './types';

const PATH_INDICATORS = ['/', './', '../', '~/', '\\'];
const HOST_BOUND_PREFIXES = ['/proc/', '/dev/', '/sys/', '/run/', '/var/run/'];
const WINDOWS_DRIVE_RE = /^[A-Z]:\\/i;

export function analyzeSettingsJson(
  settings: Record<string, unknown>,
  context: { workspacePath: string; agentDir: string },
): SettingsAnalysis {
  const pathRefs: SettingsPathRef[] = [];
  collectPathRefs(settings, '', pathRefs, context);

  const summary = {
    total: pathRefs.length,
    packageInternalWorkspace: 0,
    packageInternalAgentDir: 0,
    relative: 0,
    externalAbsolute: 0,
    hostBound: 0,
  };

  for (const ref of pathRefs) {
    switch (ref.classification) {
      case 'package-internal-workspace':
        summary.packageInternalWorkspace++;
        break;
      case 'package-internal-agentDir':
        summary.packageInternalAgentDir++;
        break;
      case 'relative':
        summary.relative++;
        break;
      case 'external-absolute':
        summary.externalAbsolute++;
        break;
      case 'host-bound':
        summary.hostBound++;
        break;
    }
  }

  return { pathRefs, summary };
}

function collectPathRefs(
  value: unknown,
  prefix: string,
  refs: SettingsPathRef[],
  context: { workspacePath: string; agentDir: string },
): void {
  if (typeof value === 'string' && looksLikePath(value)) {
    refs.push({
      key: prefix,
      value,
      classification: classifyPath(value, context),
    });
    return;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      collectPathRefs(item, `${prefix}[${index}]`, refs, context);
    }
    return;
  }

  if (typeof value === 'object' && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      collectPathRefs(child, fullKey, refs, context);
    }
  }
}

function looksLikePath(value: string): boolean {
  if (WINDOWS_DRIVE_RE.test(value)) return true;
  return PATH_INDICATORS.some((p) => value.startsWith(p));
}

function classifyPath(
  value: string,
  context: { workspacePath: string; agentDir: string },
): SettingsPathClassification {
  if (WINDOWS_DRIVE_RE.test(value)) return 'host-bound';
  if (HOST_BOUND_PREFIXES.some((p) => value.startsWith(p))) return 'host-bound';
  if (value.startsWith('./') || value.startsWith('../')) return 'relative';
  if (value.startsWith('~/')) return 'external-absolute';
  if (value.startsWith(context.agentDir + '/') || value === context.agentDir) {
    return 'package-internal-agentDir';
  }
  if (value.startsWith(context.workspacePath + '/') || value === context.workspacePath) {
    return 'package-internal-workspace';
  }
  if (value.startsWith('/')) return 'external-absolute';
  return 'relative';
}
