import type { RuntimeMode } from './types';

const RUNTIME_MODES: RuntimeMode[] = ['none', 'default', 'full'];

export function normalizeRuntimeMode(input?: string): RuntimeMode | undefined {
  if (input === undefined) return undefined;

  const normalized = input.trim().toLowerCase();
  if (!normalized) return undefined;

  if (isRuntimeMode(normalized)) {
    return normalized;
  }

  throw new Error(
    `Invalid --runtime-mode value: ${input}. Expected one of: ${RUNTIME_MODES.join(', ')}.`,
  );
}

function isRuntimeMode(value: string): value is RuntimeMode {
  return RUNTIME_MODES.includes(value as RuntimeMode);
}
