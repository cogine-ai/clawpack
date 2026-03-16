#!/usr/bin/env node

import { Command } from 'commander';
import { registerExportCommand } from './commands/export';
import { registerImportCommand } from './commands/import';
import { registerInspectCommand } from './commands/inspect';
import { registerValidateCommand } from './commands/validate';

const program = new Command();

program
  .name('clawpack')
  .description('Export, import, and validate portable OpenClaw agent/workspace templates.')
  .version('0.1.0');

registerInspectCommand(program.command('inspect'));
registerExportCommand(program.command('export'));
registerImportCommand(program.command('import'));
registerValidateCommand(program.command('validate'));

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
