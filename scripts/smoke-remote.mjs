#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { RpcPeer } from '../lib/rpc.mjs';
const [host, ...extra] = process.argv.slice(2);
if (!host || extra.length || !/^[A-Za-z0-9_][A-Za-z0-9_.@:-]*$/.test(host)) {
  console.error('Usage: node scripts/smoke-remote.mjs <SSH-host-alias>'); process.exit(2);
}
const child = spawn('ssh', ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, 'sudo', '-n', '/usr/local/sbin/codex-computer-use-gui'], { stdio: ['pipe', 'pipe', 'pipe'] });
const peer = new RpcPeer(child.stdout, child.stdin);
child.stdin.on('error', () => {});
child.on('error', error => peer.fail(error));
child.stderr.on('data', chunk => process.stderr.write(chunk));
let exited = false;
const exit = new Promise(resolve => child.once('close', () => { exited = true; resolve(); peer.close(); }));
try {
  const init = await peer.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'remote-smoke', version: '0.2.0' } });
  console.log('SERVER:', JSON.stringify(init.serverInfo));
  await peer.send({ method: 'notifications/initialized' });
  const result = await peer.request('tools/call', { name: 'get_app_state', arguments: { app: 'Finder' } }, { timeoutMs: 150000 });
  console.log(JSON.stringify({ ...result, content: result.content?.map(item => item.type === 'image' ? { ...item, data: '<omitted>' } : item) }, null, 2));
  if (result.isError || !result.content?.some(item => item.type === 'image')) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  child.stdin.end();
  const timer = setTimeout(() => { if (!exited) child.kill('SIGTERM'); }, 5000);
  await exit; clearTimeout(timer); peer.close();
}
