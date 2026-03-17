import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve('.');

export const runCliExecOptions = {
  cwd: projectRoot,
  timeout: 30_000,
  maxBuffer: 10 * 1024 * 1024,
};

export async function runCli(args: string[]) {
  return execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', ...args],
    runCliExecOptions,
  );
}
