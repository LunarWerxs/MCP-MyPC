// Installing: start the background helper at sign-in, and tell the AI apps on this computer about MCP-MyPC.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { CLI, HOME } from './config.mjs';
import { agentHealth } from './agent.mjs';
import { isWindows, sleep } from './util.mjs';

const NODE = process.execPath;
// A folder each system already has on PATH for the signed-in user, so `mypc` works in any new terminal.
const LAUNCHER = isWindows
  ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'WindowsApps', 'mypc.cmd')
  : join(homedir(), '.local', 'bin', 'mypc');
// Git Bash (the shell Claude Code uses on Windows) runs only .exe files by bare name, so a shell script sits beside mypc.cmd, as npm does.
const SH_LAUNCHER = isWindows ? join(dirname(LAUNCHER), 'mypc') : null;
const shLauncher = (node, cli) => `#!/bin/sh\nexec "${node}" "${cli}" "$@"\n`;
const SERVER_KEY = 'mypc';
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const MAC_LABEL = 'com.lunarwerxs.mcp-mypc';
const MAC_PLIST = join(homedir(), 'Library', 'LaunchAgents', `${MAC_LABEL}.plist`);
const LINUX_UNIT = join(homedir(), '.config', 'systemd', 'user', 'mcp-mypc.service');

/** Start the helper at every sign-in, and now. Returns a line describing what happened. */
export async function installAutostart() {
  if (isWindows) {
    const conhost = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'conhost.exe');
    const command = `"${conhost}" --headless "${NODE}" "${CLI}" agent`;
    const r = spawnSync('reg', ['add', RUN_KEY, '/v', 'MCP-MyPC', '/t', 'REG_SZ', '/d', command, '/f'], { windowsHide: true });
    await restartAgent();
    return r.status === 0 ? 'The background helper starts whenever you sign in to Windows.' : 'Could not set the helper to start at sign-in; it is running for now.';
  }
  if (process.platform === 'darwin') {
    mkdirSync(dirname(MAC_PLIST), { recursive: true });
    const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    writeFileSync(MAC_PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${MAC_LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(NODE)}</string><string>${xml(CLI)}</string><string>agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardErrorPath</key><string>${xml(join(HOME, 'agent-errors.log'))}</string>
</dict></plist>
`);
    spawnSync('launchctl', ['bootout', MAC_SERVICE()]);
    // bootout finishes in the background, so bootstrap can fail for a moment on a reinstall.
    for (let i = 0; i < 10; i++) {
      if (spawnSync('launchctl', ['bootstrap', `gui/${userInfo().uid}`, MAC_PLIST]).status === 0) {
        await waitForAgent();
        return 'The background helper starts whenever you log in to this Mac.';
      }
      await sleep(500);
    }
    await restartAgent();
    return 'Could not set the helper to start at login; it is running for now.';
  }
  const systemdPath = (p) => p.replace(/%/g, '%%');
  mkdirSync(dirname(LINUX_UNIT), { recursive: true });
  writeFileSync(LINUX_UNIT, `[Unit]
Description=MCP-MyPC background helper
After=network-online.target

[Service]
ExecStart="${systemdPath(NODE)}" "${systemdPath(CLI)}" agent
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`);
  spawnSync('systemctl', ['--user', 'daemon-reload']);
  if (spawnSync('systemctl', ['--user', 'enable', 'mcp-mypc.service']).status === 0) {
    await restartAgent();
    return 'The background helper starts whenever you log in.';
  }
  await restartAgent();
  return 'Could not set the helper to start at login (no systemd); it is running for now.';
}

const MAC_SERVICE = () => `gui/${userInfo().uid}/${MAC_LABEL}`;

async function waitForAgent() {
  for (let i = 0; i < 40 && !(await agentHealth()); i++) await sleep(250);
}

export async function removeAutostart() {
  if (isWindows) spawnSync('reg', ['delete', RUN_KEY, '/v', 'MCP-MyPC', '/f'], { windowsHide: true, stdio: 'ignore' });
  else if (process.platform === 'darwin') {
    spawnSync('launchctl', ['bootout', MAC_SERVICE()]);
    rmSync(MAC_PLIST, { force: true });
  } else {
    spawnSync('systemctl', ['--user', 'disable', '--now', 'mcp-mypc.service']);
    rmSync(LINUX_UNIT, { force: true });
  }
  await stopAgent();
}

export async function stopAgent() {
  const health = await agentHealth();
  if (!health) return;
  try { process.kill(health.pid); } catch {}
  for (let i = 0; i < 20 && (await agentHealth()); i++) await sleep(150);
}

/** Restart the helper so it runs the current code (after install or update), through the service manager when there is one. */
export async function restartAgent() {
  const managed = (process.platform === 'darwin' && existsSync(MAC_PLIST)
      && spawnSync('launchctl', ['kickstart', '-k', MAC_SERVICE()]).status === 0)
    || (process.platform === 'linux' && existsSync(LINUX_UNIT)
      && spawnSync('systemctl', ['--user', 'restart', 'mcp-mypc.service']).status === 0);
  if (!managed) {
    await stopAgent();
    spawn(NODE, [CLI, 'agent'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  }
  await waitForAgent();
}

/** Add the `mypc` command. Returns a line describing what happened. */
export function installLauncher() {
  mkdirSync(dirname(LAUNCHER), { recursive: true });
  writeFileSync(LAUNCHER, isWindows ? `@"${NODE}" "${CLI}" %*\r\n` : shLauncher(NODE, CLI), { mode: 0o755 });
  if (SH_LAUNCHER) writeFileSync(SH_LAUNCHER, shLauncher(NODE.replace(/\\/g, '/'), CLI.replace(/\\/g, '/')));
  return launcherOnPath()
    ? 'The mypc command works in any new terminal window.'
    : `Added the mypc command to ${dirname(LAUNCHER)}; add that folder to PATH to use it by name.`;
}

export function launcherOnPath() {
  const folder = resolve(dirname(LAUNCHER)).toLowerCase();
  return existsSync(LAUNCHER) && (process.env.PATH ?? '').split(delimiter).some((p) => p && resolve(p).toLowerCase() === folder);
}

export function removeLauncher() {
  rmSync(LAUNCHER, { force: true });
  if (SH_LAUNCHER) rmSync(SH_LAUNCHER, { force: true });
}

/** Where the Claude desktop app keeps its settings. On Windows and Mac the folder is made if Claude is not installed yet, so it works once it is. */
function claudeDesktopConfigDirs() {
  if (process.platform === 'darwin') return [join(homedir(), 'Library', 'Application Support', 'Claude')];
  if (!isWindows) return [join(homedir(), '.config', 'Claude')].filter((d) => existsSync(d));
  const dirs = [join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude')];
  // The Microsoft Store build of Claude keeps its settings inside its package folder.
  const packages = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Packages');
  try {
    for (const name of readdirSync(packages)) {
      if (name.startsWith('Claude_')) dirs.push(join(packages, name, 'LocalCache', 'Roaming', 'Claude'));
    }
  } catch {}
  const existing = dirs.filter((d) => existsSync(d));
  return existing.length ? existing : dirs.slice(0, 1);
}

function editJson(file, change) {
  let data = {};
  if (existsSync(file)) {
    try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { return false; }
    if (!existsSync(`${file}.before-mypc`)) copyFileSync(file, `${file}.before-mypc`);
  }
  change(data);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return true;
}

/** Full path of a program on PATH, or null. On Windows only something Windows can run (npm also leaves a bare shell script). */
function which(program) {
  const r = isWindows
    ? spawnSync('where', [program], { encoding: 'utf8', windowsHide: true })
    : spawnSync('sh', ['-c', `command -v ${program}`], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const found = r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return (isWindows ? found.find((p) => /\.(exe|cmd|bat)$/i.test(p)) : found[0]) ?? null;
}

function runProgram(path, args) {
  // A .cmd script (npm installs) only runs through the shell, so quote every argument for it.
  if (/\.(cmd|bat)$/i.test(path)) return spawnSync(`"${path}"`, args.map((a) => `"${a}"`), { shell: true, windowsHide: true, stdio: 'ignore' });
  return spawnSync(path, args, { windowsHide: true, stdio: 'ignore' });
}

const CODEX_CONFIG = join(homedir(), '.codex', 'config.toml');

/** Codex's settings with our [mcp_servers.mypc] table (and any sub-tables) taken out, in the file's own line endings. */
function codexWithoutUs() {
  if (!existsSync(CODEX_CONFIG)) return { rest: '', eol: '\n' };
  const current = readFileSync(CODEX_CONFIG, 'utf8');
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  let ours = false;
  const rest = current.split(/\r?\n/).filter((line) => {
    if (/^\s*\[/.test(line)) ours = /^\s*\[mcp_servers\.mypc[.\]]/.test(line);
    return !ours;
  }).join(eol).trimEnd();
  return { rest, eol };
}

/** Add MCP-MyPC to every AI app found on this computer. Returns one line per app. */
export function registerApps() {
  const done = [];
  const entry = { command: NODE, args: [CLI, 'stdio'] };
  for (const dir of claudeDesktopConfigDirs()) {
    const ok = editJson(join(dir, 'claude_desktop_config.json'), (c) => { c.mcpServers = { ...c.mcpServers, [SERVER_KEY]: entry }; });
    done.push(ok ? 'Claude desktop app: added.' : `Claude desktop app: its settings file in ${dir} could not be read, so it was left alone.`);
  }
  const claude = which('claude');
  if (claude) {
    runProgram(claude, ['mcp', 'remove', '--scope', 'user', SERVER_KEY]);
    const r = runProgram(claude, ['mcp', 'add', '--scope', 'user', SERVER_KEY, '--', NODE, CLI, 'stdio']);
    done.push(r.status === 0 ? 'Claude Code: added.' : 'Claude Code: could not add it automatically.');
  }
  if (existsSync(dirname(CODEX_CONFIG))) {
    const { rest, eol } = codexWithoutUs();
    // A JSON string is also a valid TOML string, escapes included. Codex gives up on a tool call after
    // 60 seconds unless told otherwise, and run_command may run for up to an hour.
    const table = ['[mcp_servers.mypc]', `command = ${JSON.stringify(NODE)}`, `args = [${JSON.stringify(CLI)}, "stdio"]`, 'tool_timeout_sec = 3660', ''].join(eol);
    writeFileSync(CODEX_CONFIG, rest ? `${rest}${eol}${eol}${table}` : table);
    done.push('Codex (ChatGPT\'s coding app): added.');
  }
  return done;
}

export function unregisterApps() {
  for (const dir of claudeDesktopConfigDirs()) {
    const file = join(dir, 'claude_desktop_config.json');
    if (existsSync(file)) editJson(file, (c) => { if (c.mcpServers) delete c.mcpServers[SERVER_KEY]; });
  }
  const claude = which('claude');
  if (claude) runProgram(claude, ['mcp', 'remove', '--scope', 'user', SERVER_KEY]);
  if (existsSync(CODEX_CONFIG)) {
    const { rest, eol } = codexWithoutUs();
    writeFileSync(CODEX_CONFIG, `${rest}${eol}`);
  }
}
