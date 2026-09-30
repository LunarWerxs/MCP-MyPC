import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLI = join(ROOT, 'bin', 'mypc.mjs');
export const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

// The shared relay. Anyone can run their own (see relay/) and point at it with `mypc install --relay <url>`.
export const DEFAULT_RELAY = 'https://mpc-mypc-relay.lunawerx.workers.dev';

export const HOME = process.env.MYPC_HOME || join(homedir(), '.mpc-mypc');
export const PATHS = {
  config: join(HOME, 'config.json'),
  activity: join(HOME, 'remote-activity.log'),
  agentLog: join(HOME, 'agent.log'),
  browserProfile: join(HOME, 'browser-profile'),
};
// The background agent listens here (this computer only) so a second copy can tell one is running.
// Below every system's range of temporary ports, so an outgoing connection never holds it.
export const AGENT_PORT = Number(process.env.MYPC_PORT) || 17394;

export function readConfig() {
  let saved = {};
  try { saved = JSON.parse(readFileSync(PATHS.config, 'utf8')); } catch {}
  return saved;
}

/** The settings every command works from, creating this computer's id the first time. */
export function loadConfig() {
  const saved = readConfig();
  if (!saved.deviceId) {
    saved.deviceId = randomBytes(8).toString('hex');
    saveConfig(saved);
  }
  return {
    ...saved,
    name: saved.name || hostname(),
    relay: (process.env.MYPC_RELAY || saved.relay || DEFAULT_RELAY).replace(/\/+$/, ''),
  };
}

/** Merge `changes` into the saved settings (a null value removes the key). */
export function updateConfig(changes) {
  const saved = readConfig();
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) delete saved[key];
    else saved[key] = value;
  }
  saveConfig(saved);
  return loadConfig();
}

function saveConfig(saved) {
  mkdirSync(HOME, { recursive: true });
  const tmp = `${PATHS.config}.tmp`;
  writeFileSync(tmp, JSON.stringify(saved, null, 2), { mode: 0o600 });
  renameSync(tmp, PATHS.config);
}

export function wsUrl(relay, path) {
  return relay.replace(/^http/, 'ws') + path;
}
