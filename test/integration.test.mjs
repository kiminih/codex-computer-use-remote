import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RpcPeer } from '../lib/rpc.mjs';
const fixture = fileURLToPath(new URL('./fixtures/mcp-host.mjs', import.meta.url));
for (const ending of ['EOF', 'SIGTERM', 'SIGINT']) test(`MCP → session → child RPC integration; shutdown=${ending}`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cu-integration-')), app = path.join(root, 'Official Test.app'), state = path.join(root, 'state');
  await mkdir(app);
  const child = spawn(process.execPath, [fixture, state, app], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = ''; child.stderr.on('data', c => { stderr += c; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const peer = new RpcPeer(child.stdout, child.stdin);
  try {
    await peer.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'integration', version: '1' } });
    await peer.send({ method: 'notifications/initialized' });
    const call = (name, args) => peer.request('tools/call', { name, arguments: args });
    const first = await call('get_app_state', { app: 'Finder' }); assert.equal(first.isError, false);
    const firstState = JSON.parse(first.content[0].text);
    const second = await call('click', { app: 'Finder', element_index: '1' }); assert.equal(second.isError, false);
    const next = JSON.parse(second.content[0].text); assert.equal(next.calls, 2); assert.equal(next.env.CODEX_HOME, firstState.env.CODEX_HOME);
    if (ending === 'EOF') child.stdin.end(); else child.kill(ending);
    const outcome = await exited; assert.equal(outcome.code, 0, stderr);
    assert.equal(existsSync(firstState.env.CODEX_HOME), false); assert.equal(existsSync(path.join(state, 'session.lock')), false);
  } finally { peer.close(); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await rm(root, { recursive: true, force: true }); }
});
