const SECRET_KEYS = new Set([
  'apikey',
  'api_key',
  'apikeys',
  'secret',
  'secretkey',
  'secret_key',
  'token',
  'accesstoken',
  'access_token',
  'password',
  'credentials',
]);

const SECRET_HEADER_KEYS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'x-secret',
]);

export function sanitizeModelsJson(
  input: Record<string, unknown>,
): { sanitized: Record<string, unknown> | undefined; warnings: string[] } {
  const warnings: string[] = [];

  if (!input || typeof input !== 'object' || Object.keys(input).length === 0) {
    warnings.push('models.json is empty or invalid — skipped.');
    return { sanitized: undefined, warnings };
  }

  const cleaned = deepSanitize(input, '', warnings);

  if (!hasUsefulContent(cleaned)) {
    warnings.push('models.json contained only secrets — skipped entirely.');
    return { sanitized: undefined, warnings };
  }

  return { sanitized: cleaned as Record<string, unknown>, warnings };
}

function deepSanitize(
  value: unknown,
  keyPath: string,
  warnings: string[],
): unknown {
  if (value === null || value === undefined) return value;

  if (isSecretRef(value)) {
    warnings.push(`Stripped SecretRef at ${keyPath || 'root'}.`);
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => deepSanitize(item, `${keyPath}[${i}]`, warnings));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const fullPath = keyPath ? `${keyPath}.${key}` : key;

      if (isSecretKey(key)) {
        warnings.push(`Stripped secret field: ${fullPath}`);
        continue;
      }

      if (isSecretRef(val)) {
        warnings.push(`Stripped SecretRef at ${fullPath}.`);
        continue;
      }

      if (key.toLowerCase() === 'headers' && typeof val === 'object' && val !== null) {
        const sanitizedHeaders = sanitizeHeaders(val as Record<string, unknown>, fullPath, warnings);
        if (Object.keys(sanitizedHeaders).length > 0) {
          result[key] = sanitizedHeaders;
        }
        continue;
      }

      const sanitized = deepSanitize(val, fullPath, warnings);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }

  return value;
}

function sanitizeHeaders(
  headers: Record<string, unknown>,
  parentPath: string,
  warnings: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(headers)) {
    const fullPath = `${parentPath}.${key}`;
    if (SECRET_HEADER_KEYS.has(key.toLowerCase())) {
      warnings.push(`Stripped secret header: ${fullPath}`);
      continue;
    }

    const sanitized = deepSanitize(val, fullPath, warnings);
    if (sanitized !== undefined && hasUsefulContent(sanitized)) {
      result[key] = sanitized;
    }
  }
  return result;
}

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key.toLowerCase());
}

function isSecretRef(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$secretRef' in (value as Record<string, unknown>)
  );
}

function hasUsefulContent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'object') return true;

  if (Array.isArray(value)) {
    return value.some((item) => hasUsefulContent(item));
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;
  return entries.some(([, val]) => hasUsefulContent(val));
}
