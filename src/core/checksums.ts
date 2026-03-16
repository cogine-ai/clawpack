import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function checksumFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export function checksumText(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
