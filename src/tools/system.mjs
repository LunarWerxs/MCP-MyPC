import { spawn } from 'node:child_process';
import os from 'node:os';
import { expandPath, formatBytes, isWindows, runShell, text } from '../util.mjs';

const DISKS = isWindows
  ? "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { '{0} {1:N1} GB free of {2:N1} GB' -f $_.DeviceID, ($_.FreeSpace/1GB), ($_.Size/1GB) }"
  : 'df -h -P / "$HOME" 2>/dev/null | awk \'NR>1 && !seen[$1]++ { print $6 " " $4 " free of " $2 }\'';

export function systemName() {
  if (isWindows) {
    const build = Number(os.release().split('.')[2]);
    return `${build >= 22000 ? 'Windows 11' : os.version()} (build ${os.release()})`;
  }
  if (process.platform === 'darwin') return `macOS (Darwin ${os.release()})`;
  return `${os.version()} (${os.release()})`;
}

export const computerInfo = {
  name: 'computer_info',
  description: 'Basic facts about the computer: system version, memory, disk space, processor, how long it has been on.',
  inputSchema: { type: 'object', properties: {} },
  summary: () => '',
  async run() {
    const disks = await runShell(DISKS, { timeoutMs: 20_000 });
    const cpus = os.cpus();
    return text([
      `Computer: ${os.hostname()} (signed in as ${os.userInfo().username})`,
      `System: ${systemName()}, ${os.arch()}`,
      `Processor: ${cpus[0]?.model?.trim() ?? 'unknown'} (${cpus.length} threads)`,
      `Memory: ${formatBytes(os.freemem())} free of ${formatBytes(os.totalmem())}`,
      `On for: ${(os.uptime() / 3600).toFixed(1)} hours`,
      `Disks:\n${disks.stdout.trim() || '(could not read)'}`,
      `Home folder: ${os.homedir()}`,
    ].join('\n'));
  },
};

export const openTool = {
  name: 'open',
  description: 'Open a website, file or folder on the computer with its usual program, so the person at that computer sees it.',
  inputSchema: {
    type: 'object',
    properties: { target: { type: 'string', description: 'A web address, or the path of a file or folder.' } },
    required: ['target'],
  },
  summary: (args) => args.target,
  async run({ target }) {
    // A scheme needs two or more letters, so a drive letter like C: counts as a path.
    const value = /^[a-z][a-z0-9+.-]+:/i.test(target) ? target : expandPath(target);
    if (isWindows) {
      const r = await runShell('Start-Process -FilePath $env:MYPC_TARGET', { timeoutMs: 20_000, env: { MYPC_TARGET: value } });
      if (r.code !== 0) throw new Error(`Could not open ${value}: ${r.stderr.trim()}`);
    } else {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      await new Promise((resolve, reject) => {
        const child = spawn(opener, [value], { stdio: 'ignore' });
        child.once('error', () => reject(new Error(`Could not open it: ${opener} is not available on this computer.`)));
        child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(`Could not open ${value}.`))));
      });
    }
    return text(`Opened ${value}.`);
  },
};
