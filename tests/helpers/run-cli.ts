import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve('.');

export const runCliExecOptions = {
  cwd: projectRoot,
  timeout: 30_000,
  maxBuffer: 10 * 1024 * 1024,
  env: {
    ...process.env,
    OPENCLAW_CONFIG_PATH: path.join(projectRoot, 'tests', 'tmp', '.nonexistent-openclaw.json'),
  },
};

export async function runCli(args: string[]) {
  return execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'src/cli.ts', ...args],
    runCliExecOptions,
  );
}
