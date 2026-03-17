/**
 * Appends a labelled section to a lines array when items are non-empty.
 * Shared across command formatters to keep section rendering consistent.
 */
export function pushSection(lines: string[], heading: string, items: string[]): void {
  if (items.length === 0) {
    return;
  }

  lines.push('', `${heading}:`, ...items.map((item) => `- ${item}`));
}
