import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMcpServer, handleHttpBody } from '../src/mcp.mjs';

const server = createMcpServer({
  listTools: () => [{ name: 'echo', inputSchema: { type: 'object', properties: {} } }],
  callTool: async (name, args) => ({ content: [{ type: 'text', text: `${name}:${args.value}` }] }),
  instructions: () => 'hi',
});

test('initialize agrees on a protocol version the client knows', async () => {
  const known = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(known.result.protocolVersion, '2025-06-18');
  const future = await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
  assert.equal(future.result.protocolVersion, '2025-11-25');
  assert.deepEqual(future.result.capabilities, { tools: {} });
});

test('notifications get no reply; over HTTP that is a 202 with no body', async () => {
  assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual(await handleHttpBody(server, '{"jsonrpc":"2.0","method":"notifications/initialized"}'), { status: 202, body: '' });
});

test('tool calls and unknown methods answer by the JSON-RPC rules', async () => {
  const call = await handleHttpBody(server, JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'echo', arguments: { value: 7 } } }));
  assert.deepEqual(JSON.parse(call.body), { jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'echo:7' }] } });
  const unknown = await server.handle({ jsonrpc: '2.0', id: 4, method: 'resources/list' });
  assert.equal(unknown.error.code, -32601);
  assert.equal((await handleHttpBody(server, 'not json')).status, 400);
});
