// MPC-MyPC relay: a Cloudflare Worker that only passes messages along.
//
// /room/<id>           Family room. Every computer in a family holds one WebSocket here and every
//                      binary message is forwarded to the others. Messages are end-to-end encrypted
//                      with the family code, which the relay never sees, so it cannot read or forge them.
// /link/<token>/agent  A computer's ChatGPT link: its agent holds this WebSocket open.
// /link/<token>/mcp    What ChatGPT calls (MCP over HTTP). Each request is handed to the agent and its
//                      answer returned. This path is NOT end-to-end encrypted: ChatGPT only speaks
//                      HTTPS to a public address, so the relay carries it in the clear.

const ROOM_ID = /^[0-9a-f]{64}$/;
const LINK_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ROOM_SOCKETS = 16;
const MAX_BODY = 4 * 1024 * 1024;
const AGENT_TIMEOUT_MS = 240_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const [kind, id, action] = url.pathname.split('/').filter(Boolean);
    if (kind === 'room' && ROOM_ID.test(id ?? '') && !action) {
      return env.ROOMS.get(env.ROOMS.idFromName(id)).fetch(request);
    }
    if (kind === 'link' && LINK_TOKEN.test(id ?? '') && (action === 'agent' || action === 'mcp')) {
      // The object is named by a hash so the token itself is never stored.
      return env.LINKS.get(env.LINKS.idFromName(await sha256(id))).fetch(request);
    }
    if (url.pathname === '/') {
      return new Response('MPC-MyPC relay. It only passes messages along: https://github.com/LunarWerxs/MPC-MyPC\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    return new Response('Not found\n', { status: 404 });
  },
};

export class Room {
  constructor(state) {
    this.state = state;
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket\n', { status: 426 });
    if (this.state.getWebSockets().length >= MAX_ROOM_SOCKETS) return new Response('Room is full\n', { status: 429 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message === 'string') return;
    for (const other of this.state.getWebSockets()) {
      if (other !== ws) try { other.send(message); } catch {}
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch {}
  }
}

export class Link {
  constructor(state) {
    this.state = state;
    this.pending = new Map();
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const action = new URL(request.url).pathname.split('/').filter(Boolean)[2];
    if (action === 'agent') return this.acceptAgent(request);
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });

    const body = await request.text();
    if (body.length > MAX_BODY) return new Response('Request too large\n', { status: 413 });
    const agent = this.state.getWebSockets('agent').at(-1);
    if (!agent) return rpcError(body, 'This computer is offline right now. It answers again once it is switched on and signed in.');

    const rid = crypto.randomUUID();
    const answer = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid);
        resolve(null);
      }, AGENT_TIMEOUT_MS);
      this.pending.set(rid, (reply) => {
        clearTimeout(timer);
        resolve(reply);
      });
      agent.send(JSON.stringify({ rid, body }));
    });
    if (!answer) return rpcError(body, 'The computer did not answer in time.');
    return new Response(answer.body || null, {
      status: answer.status || 200,
      headers: answer.body ? { 'content-type': 'application/json' } : {},
    });
  }

  acceptAgent(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket\n', { status: 426 });
    for (const old of this.state.getWebSockets('agent')) try { old.close(4000, 'replaced by a newer connection'); } catch {}
    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, ['agent']);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    let reply;
    try { reply = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); } catch { return; }
    const resolve = this.pending.get(reply?.rid);
    if (resolve) {
      this.pending.delete(reply.rid);
      resolve(reply);
    }
  }

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch {}
  }
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function rpcError(body, message) {
  let id = null;
  try { id = JSON.parse(body)?.id ?? null; } catch {}
  return Response.json({ jsonrpc: '2.0', id, error: { code: -32000, message } });
}
