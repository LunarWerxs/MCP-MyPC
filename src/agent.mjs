// The background helper. It starts when the person signs in and keeps this computer reachable:
// it answers family computers in the family room and, if switched on, the ChatGPT link.
// It re-reads the settings every few seconds, so `mypc family join` and friends apply at once.
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { AGENT_PORT, PATHS, VERSION, loadConfig, wsUrl } from './config.mjs';
import { FamilyLink } from './family.mjs';
import { createMcpServer, handleHttpBody } from './mcp.mjs';
import { RelaySocket } from './relay-socket.mjs';
import { createToolbox, runLocal } from './tools/index.mjs';
import { systemName } from './tools/system.mjs';
import { instructions } from './instructions.mjs';

const CHATGPT_CALLER = { name: 'ChatGPT link' };

export async function runAgent() {
  if (!(await claimPort())) {
    log((await agentHealth()) ? 'another copy is already running; exiting' : `port ${AGENT_PORT} is taken by another program; set MYPC_PORT to a free one`);
    return;
  }
  log(`started, version ${VERSION}`);
  let config = null;
  let family = null;
  let chatgpt = null;
  let signature = '';

  const apply = () => {
    const next = loadConfig();
    const nextSignature = JSON.stringify([next.name, next.relay, next.familyCode, next.chatgptToken]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    config = next;
    family?.close();
    chatgpt?.close();
    family = config.familyCode
      ? new FamilyLink({
          relay: config.relay,
          code: config.familyCode,
          device: device(config),
          serve: (tool, args, from) => runLocal(tool, args, from),
          log: (m) => log(`family: ${m}`),
        })
      : null;
    chatgpt = config.chatgptToken ? chatgptLink(config, () => family) : null;
    log(`settings: name "${config.name}", family ${family ? 'on' : 'off'}, ChatGPT link ${chatgpt ? 'on' : 'off'}`);
  };
  apply();
  setInterval(apply, 5000);

  healthServer.on('request', (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      product: 'mpc-mypc', pid: process.pid, version: VERSION, name: config.name,
      family: Boolean(family), familyConnected: Boolean(family?.connected),
      chatgpt: Boolean(chatgpt), chatgptConnected: Boolean(chatgpt?.isOpen),
    }));
  });
}

export function device(config) {
  return { id: config.deviceId, name: config.name, os: systemName() };
}

/** ChatGPT calls the relay over HTTPS; the relay hands each request to this socket and returns the answer. */
function chatgptLink(config, family) {
  const server = createMcpServer({ ...createToolbox({ config, family, caller: CHATGPT_CALLER }), instructions: () => instructions(config) });
  const socket = new RelaySocket(wsUrl(config.relay, `/link/${config.chatgptToken}/agent`), {
    persistent: true,
    log: (m) => log(`ChatGPT link: ${m}`),
    onMessage: async (data) => {
      let request;
      try { request = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8')); } catch { return; }
      if (!request?.rid) return;
      const reply = await handleHttpBody(server, String(request.body ?? ''));
      socket.send(JSON.stringify({ rid: request.rid, ...reply }));
    },
  });
  return socket;
}

// Listening on a fixed local port is the single-instance lock, and lets `mypc status` ask how it is doing.
const healthServer = createServer();

function claimPort() {
  return new Promise((resolve) => {
    healthServer.once('error', () => resolve(false));
    healthServer.listen(AGENT_PORT, '127.0.0.1', () => resolve(true));
  });
}

/** What the running agent says about itself, or null if none is running. */
export async function agentHealth() {
  try {
    const r = await fetch(`http://127.0.0.1:${AGENT_PORT}/`, { signal: AbortSignal.timeout(2000) });
    const health = await r.json();
    return health?.product === 'mpc-mypc' ? health : null;
  } catch {
    return null;
  }
}

const LOG_MAX = 1024 * 1024;

function log(message) {
  try {
    if (statSync(PATHS.agentLog, { throwIfNoEntry: false })?.size > LOG_MAX) {
      writeFileSync(PATHS.agentLog, readFileSync(PATHS.agentLog, 'utf8').slice(-LOG_MAX / 2));
    }
    appendFileSync(PATHS.agentLog, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}
