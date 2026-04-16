import type {
  CompatibilityEntry,
  RuntimeArtifactBuckets,
  SkillsManifest,
} from './types';

const LABEL_ORDER = ['official', 'inferred', 'manual', 'unsupported'] as const;

export function buildRuntimeCompatibility(
  artifacts: RuntimeArtifactBuckets | undefined,
  warnings: string[] = [],
): CompatibilityEntry[] {
  if (!artifacts) {
    return buildManualCompatibility(warnings);
  }

  const entries: CompatibilityEntry[] = buildManualCompatibility(warnings);

  if (artifacts.grounded.length > 0) {
    entries.push({
      label: 'official',
      message: 'Source-backed runtime artifacts',
      items: sortUnique(artifacts.grounded),
    });
  }

  if (artifacts.inferred.length > 0) {
    entries.push({
      label: 'inferred',
      message: 'Inferred runtime artifacts',
      items: sortUnique(artifacts.inferred),
    });
  }

  if (artifacts.unsupported.length > 0) {
    entries.push({
      label: 'unsupported',
      message: 'Unsupported runtime artifacts are not packaged',
      items: sortUnique(artifacts.unsupported),
    });
  }

  return entries;
}

export function buildSkillsCompatibility(skills: SkillsManifest): CompatibilityEntry[] {
  const detected = sortUnique([
    ...skills.workspaceSkills,
    ...skills.referencedSkills,
    ...skills.notes,
  ]);

  if (detected.length === 0) {
    return [];
  }

  return [
    {
      label: 'unsupported',
      message: 'Skill implementations are manifest-only and are not bundled',
      items: detected,
    },
    {
      label: 'manual',
      message: 'Install required skills manually on the target OpenClaw instance',
      items: detected,
    },
  ];
}

export function buildManualCompatibility(messages: string[]): CompatibilityEntry[] {
  return sortUnique(messages)
    .filter((message) => message.length > 0)
    .map((message) => ({
      label: 'manual',
      message,
    }));
}

export function buildUnsupportedCompatibility(messages: string[]): CompatibilityEntry[] {
  return sortUnique(messages)
    .filter((message) => message.length > 0)
    .map((message) => ({
      label: 'unsupported',
      message,
    }));
}

export function mergeCompatibilityEntries(
  ...entryGroups: Array<CompatibilityEntry[] | undefined>
): CompatibilityEntry[] {
  const seen = new Set<string>();
  const merged: CompatibilityEntry[] = [];

  for (const group of entryGroups) {
    for (const entry of group ?? []) {
      const normalized: CompatibilityEntry = {
        label: entry.label,
        message: entry.message,
        items: entry.items ? sortUnique(entry.items) : undefined,
      };
      const key = JSON.stringify([
        normalized.label,
        normalized.message,
        normalized.items ?? [],
      ]);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged.sort(compareCompatibilityEntries);
}

export function renderCompatibilityLines(entries: CompatibilityEntry[]): string[] {
  const lines = ['Compatibility labels:'];

  for (const label of LABEL_ORDER) {
    const matching = entries.filter((entry) => entry.label === label);
    const content = matching
      .map((entry) =>
        entry.items && entry.items.length > 0
          ? `${entry.message}: ${entry.items.join(', ')}`
          : entry.message,
      )
      .join(' | ');
    lines.push(`  ${label}: ${content || 'none'}`);
  }

  return lines;
}

function compareCompatibilityEntries(left: CompatibilityEntry, right: CompatibilityEntry): number {
  const labelOrder = LABEL_ORDER.indexOf(left.label) - LABEL_ORDER.indexOf(right.label);
  if (labelOrder !== 0) {
    return labelOrder;
  }

  const messageOrder = left.message.localeCompare(right.message);
  if (messageOrder !== 0) {
    return messageOrder;
  }

  return JSON.stringify(left.items ?? []).localeCompare(JSON.stringify(right.items ?? []));
}

function sortUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
