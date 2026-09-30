import { stat } from 'node:fs/promises';
import { expandPath, isWindows, runShell, text } from '../util.mjs';

export const runCommand = {
  name: 'run_command',
  description: `Run a command on the computer and return what it printed. ${isWindows ? 'This computer runs it in PowerShell.' : 'This computer runs it in the login shell.'} Use it for anything the other tools do not cover: installing or updating programs, checking settings, fixing problems. Family computers may run a different system: check list_computers first.`,
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The command to run.' },
      folder: { type: 'string', description: 'Folder to run it in. Defaults to the home folder.' },
      timeout_seconds: { type: 'number', description: 'Stop it after this many seconds. Default 120, most 3600.' },
    },
    required: ['command'],
  },
  timeoutMs: (args) => commandTimeout(args) + 30_000,
  summary: (args) => args.command,
  async run(args) {
    const cwd = expandPath(args.folder);
    if (!(await stat(cwd).catch(() => null))?.isDirectory()) throw new Error(`There is no folder at ${cwd}.`);
    const r = await runShell(String(args.command), { cwd, timeoutMs: commandTimeout(args) });
    if (r.error) throw new Error(`Could not start the command: ${r.error}`);
    const lines = [r.timedOut
      ? `Stopped after ${Math.round(r.seconds)} seconds because it ran too long.`
      : `Exit code ${r.code} (took ${r.seconds.toFixed(1)} s).`];
    if (r.stdout.trim()) lines.push(r.stdout.trimEnd());
    if (r.stderr.trim()) lines.push('--- errors ---', r.stderr.trimEnd());
    if (r.truncated) lines.push('(Output was cut off because it was very long.)');
    return text(lines.join('\n'));
  },
};

function commandTimeout({ timeout_seconds }) {
  const seconds = Number(timeout_seconds) || 120;
  return Math.min(Math.max(seconds, 1), 3600) * 1000;
}
