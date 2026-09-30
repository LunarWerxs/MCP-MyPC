// The Model Context Protocol, just the part a tools-only server needs: JSON-RPC over stdio (Claude,
// Codex) and over HTTP bodies (ChatGPT, through the relay).
import { createInterface } from 'node:readline';
import { VERSION } from './config.mjs';

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

export function createMcpServer({ listTools, callTool, instructions }) {
  async function dispatch(method, params) {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'mpc-mypc', title: 'MPC-MyPC', version: VERSION },
          instructions: instructions(),
        };
      case 'ping':
        return {};
      case 'tools/list':
        return { tools: listTools() };
      case 'tools/call':
        return callTool(params.name, params.arguments ?? {});
      default:
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }

  /** Answer one JSON-RPC message (or a batch). Returns null when nothing should be sent back. */
  async function handle(message) {
    if (Array.isArray(message)) {
      const replies = (await Promise.all(message.map(handle))).filter(Boolean);
      return replies.length ? replies : null;
    }
    if (!message || typeof message.method !== 'string') return null;
    const isNotification = !('id' in message);
    try {
      const result = await dispatch(message.method, message.params ?? {});
      return isNotification ? null : { jsonrpc: '2.0', id: message.id, result };
    } catch (e) {
      return isNotification ? null : { jsonrpc: '2.0', id: message.id, error: { code: e.code ?? -32603, message: e.message } };
    }
  }

  return { handle };
}

export function serveStdio(server) {
  const write = (reply) => process.stdout.write(`${JSON.stringify(reply)}\n`);
  const inFlight = new Set();
  const answer = async (line) => {
    let message;
    try { message = JSON.parse(line); } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    const reply = await server.handle(message);
    if (reply) write(reply);
  };
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    const pending = answer(line).finally(() => inFlight.delete(pending));
    inFlight.add(pending);
  });
  // The app closed our input: finish what it already asked for, flush, then go.
  lines.on('close', async () => {
    await Promise.allSettled([...inFlight]);
    process.stdout.write('', () => process.exit(0));
  });
}

/** One MCP-over-HTTP POST body in, `{ status, body }` out. */
export async function handleHttpBody(server, body) {
  let message;
  try { message = JSON.parse(body); } catch {
    return { status: 400, body: JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) };
  }
  const reply = await server.handle(message);
  return reply ? { status: 200, body: JSON.stringify(reply) } : { status: 202, body: '' };
}
