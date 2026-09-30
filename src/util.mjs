import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';

export const isWindows = process.platform === 'win32';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const text = (value) => [{ type: 'text', text: String(value) }];
export const image = (data, mimeType) => [{ type: 'image', data, mimeType }];
export const errorResult = (message) => ({ content: text(message), isError: true });

/** `~/x`, relative paths and bare names all resolve from the home folder. */
export function expandPath(p) {
  const raw = String(p ?? '').trim();
  if (!raw || raw === '~') return homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return resolve(homedir(), raw.slice(2));
  return isAbsolute(raw) ? raw : resolve(homedir(), raw);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

const OUTPUT_CAP = 100_000;

/**
 * Run a command in the computer's own shell (PowerShell on Windows, the login shell elsewhere).
 * Never opens a window, never waits for input, and kills the whole process tree on timeout.
 */
export function runShell(command, { cwd, timeoutMs = 120_000, env = {} } = {}) {
  const [file, args] = isWindows
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand',
        Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'\n${command}`, 'utf16le').toString('base64')]]
    : [process.env.SHELL || '/bin/sh', ['-lc', command]];
  const started = Date.now();
  return new Promise((resolveRun) => {
    const child = spawn(file, args, {
      cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !isWindows,
    });
    const out = { stdout: '', stderr: '', truncated: false };
    const collect = (key) => (chunk) => {
      if (out[key].length >= OUTPUT_CAP) { out.truncated = true; return; }
      out[key] += chunk;
    };
    // setEncoding decodes across chunk boundaries, so a character split between two reads stays whole.
    child.stdout.setEncoding('utf8').on('data', collect('stdout'));
    child.stderr.setEncoding('utf8').on('data', collect('stderr'));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, timeoutMs);
    const finish = (code, error) => {
      clearTimeout(timer);
      resolveRun({ ...out, code, error, timedOut, seconds: (Date.now() - started) / 1000 });
    };
    child.on('error', (e) => finish(null, e.message));
    child.on('close', (code) => finish(code));
  });
}
