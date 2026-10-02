import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serve, PROTOCOLS } from '../lib/mcp-stdio.mjs';
import { RpcPeer } from '../lib/rpc.mjs';
const cli = fileURLToPath(new URL('../bin/mac-computer-use-mcp.mjs', import.meta.url));
const INIT = { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'tests', version: '1' } };
function setup(t, computer, caps = {}) {
  const input = new PassThrough(), output = new PassThrough();
  const fake = computer ?? { execute: async () => ({ content: [{ type: 'text', text: 'state' }], isError: false }), close: async () => {} };
  const server = serve({ input, output, computer: fake, status: () => ({ brokerVerified: true, guiVerified: false }) });
  const peer = new RpcPeer(output, input);
  t.after(async () => { await server.close(); await server.done; peer.close(); });
  return { input, output, server, peer, init: async () => {
    const result = await peer.request('initialize', { ...INIT, capabilities: caps }); await peer.send({ method: 'notifications/initialized' }); return result;
  } };
}
for (const version of PROTOCOLS) test(`MCP negotiates supported ${version}`, async t => {
  const x = setup(t); assert.equal((await x.peer.request('initialize', { ...INIT, protocolVersion: version })).protocolVersion, version);
});
test('MCP does not falsely claim a new protocol version', async t => {
  const x = setup(t); const result = await x.peer.request('initialize', { ...INIT, protocolVersion: '2099-01-01' }); assert.equal(result.protocolVersion, PROTOCOLS[0]);
});
test('MCP refuses methods before initialization', async t => {
  const x = setup(t); await assert.rejects(x.peer.request('tools/list'), /Not initialized/);
});
test('MCP requires initialized notification', async t => {
  const x = setup(t); await x.peer.request('initialize', INIT); await assert.rejects(x.peer.request('tools/list'), /Not initialized/);
});
test('MCP rejects duplicate initialization', async t => {
  const x = setup(t); await x.init(); await assert.rejects(x.peer.request('initialize', INIT), /Already initialized/);
});
test('MCP validates initialization parameters', async t => {
  const x = setup(t); await assert.rejects(x.peer.request('initialize', { protocolVersion: '2025-06-18' }), /Invalid initialize/);
});
test('MCP tools/list and ping', async t => {
  const x = setup(t); await x.init(); assert.equal((await x.peer.request('tools/list')).tools.length, 11); assert.deepEqual(await x.peer.request('ping'), {});
});
test('MCP exposes status without touching GUI', async t => {
  const x = setup(t, { execute: () => assert.fail('must not execute GUI'), close: async () => {} }); await x.init();
  const result = await x.peer.request('tools/call', { name: 'computer_use_status' }); assert.equal(result.structuredContent.guiVerified, false);
});
test('MCP passes image blocks without text flattening', async t => {
  const block = { type: 'image', mimeType: 'image/jpeg', data: 'ZmFrZQ==' };
  const x = setup(t, { execute: async () => ({ content: [block], isError: false }), close: async () => {} }); await x.init();
  assert.deepEqual((await x.peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder' } })).content, [block]);
});
test('MCP returns native errors as isError', async t => {
  const x = setup(t, { execute: async () => { throw new Error('Native unavailable'); }, close: async () => {} }); await x.init();
  const result = await x.peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder' } }); assert.equal(result.isError, true); assert.match(result.content[0].text, /Native unavailable/);
});
test('MCP rejects unknown tool and unsupported arguments', async t => {
  const x = setup(t); await x.init();
  await assert.rejects(x.peer.request('tools/call', { name: 'shell', arguments: {} }), /Unknown tool/);
  await assert.rejects(x.peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder', command: 'bad' } }), /Unsupported argument/);
});
test('MCP has no sampling or arbitrary shell method', async t => {
  const x = setup(t); await x.init(); for (const method of ['sampling/createMessage', 'exec', 'turn/start']) await assert.rejects(x.peer.request(method), /Method not found/);
});
test('MCP cancels an in-flight request without a late response', async t => {
  let cancelled = false, responded = false, started;
  const begin = new Promise(resolve => { started = resolve; });
  const x = setup(t, { execute: (_n, _a, { signal }) => new Promise(resolve => {
    started(); signal.addEventListener('abort', () => { cancelled = true; resolve({ content: [], isError: true }); }, { once: true });
  }), close: async () => {} }); await x.init();
  x.peer.on('message', message => { if (message.id === 'cancel-target') responded = true; });
  await x.peer.send({ id: 'cancel-target', method: 'tools/call', params: { name: 'get_app_state', arguments: { app: 'Finder' } } });
  await begin; await x.peer.send({ method: 'notifications/cancelled', params: { requestId: 'cancel-target' } });
  await new Promise(r => setTimeout(r, 20)); assert.equal(cancelled, true); assert.equal(responded, false); assert.deepEqual(await x.peer.request('ping'), {});
});
test('MCP safely ignores unknown cancellation', async t => {
  const x = setup(t); await x.init(); await x.peer.send({ method: 'notifications/cancelled', params: { requestId: 'not-a-request' } }); assert.deepEqual(await x.peer.request('ping'), {});
});
test('MCP sends consent only when the client supports it', async t => {
  let answer;
  const x = setup(t, { execute: async (_n, _a, opts) => {
    answer = await opts.onElicitation({ mode: 'form', message: 'Allow?', requestedSchema: { type: 'object', properties: {} } });
    return { content: [], isError: false };
  }, close: async () => {} }); await x.init();
  await x.peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder' } }); assert.equal(answer.action, 'cancel');
});
test('MCP forwards consent response without auto-accepting', async t => {
  let answer;
  const x = setup(t, { execute: async (_n, _a, opts) => {
    answer = await opts.onElicitation({ mode: 'form', message: 'Allow?', requestedSchema: { type: 'object', properties: {} } }); return { content: [], isError: false };
  }, close: async () => {} }, { elicitation: { form: {} } }); await x.init();
  x.peer.on('message', message => { if (message.method === 'elicitation/create') void x.peer.send({ id: message.id, result: { action: 'decline' } }); });
  await x.peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder' } }); assert.equal(answer.action, 'decline');
});
test('MCP closes resources on stdin EOF', async () => {
  let closed = false; const input = new PassThrough(), output = new PassThrough();
  const server = serve({ input, output, computer: { close: async () => { closed = true; } } }); input.end(); await server.done; assert.equal(closed, true);
});
test('CLI version works without macOS or account access', () => {
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }); assert.equal(result.status, 0); assert.match(result.stdout, /0\.2\.0/);
});
test('CLI has no production signature bypass flag', () => {
  const result = spawnSync(process.execPath, [cli, '--skip-signature-verification'], { encoding: 'utf8' }); assert.equal(result.status, 2);
});
test('real CLI completes MCP handshake and shuts down on EOF', async () => {
  const child = spawn(process.execPath, [cli], { stdio: ['pipe', 'pipe', 'pipe'] });
  const peer = new RpcPeer(child.stdout, child.stdin); let stderr = ''; child.stderr.on('data', b => { stderr += b; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    const result = await peer.request('initialize', INIT); assert.equal(result.serverInfo.version, '0.2.0');
    await peer.send({ method: 'notifications/initialized' }); assert.equal((await peer.request('tools/list')).tools.length, 11);
    child.stdin.end(); const outcome = await exited; assert.equal(outcome.code, 0, stderr);
  } finally { peer.close(); if (child.exitCode === null) child.kill('SIGKILL'); }
});
