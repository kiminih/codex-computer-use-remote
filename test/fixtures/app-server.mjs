import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
const mode = process.argv[2] ?? 'normal';
const pending = new Map();
let initialized = false, acknowledged = false, calls = 0, child;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const result = (id, value) => send({ id, result: value });
const content = () => ({ content: [
  { type: 'text', text: JSON.stringify({ calls, childPid: child?.pid, env: process.env, acknowledged }) },
  { type: 'image', mimeType: 'image/jpeg', data: 'ZmFrZQ==' }
], isError: false });
if (mode === 'startup-exit') process.exit(7);
for await (const line of createInterface({ input: process.stdin })) {
  const m = JSON.parse(line);
  if (pending.has(m.id) && m.result) {
    const id = pending.get(m.id); pending.delete(m.id);
    result(id, { content: [{ type: 'text', text: JSON.stringify(m.result) }], isError: m.result.action !== 'accept' });
    continue;
  }
  if (m.method === 'initialize') { initialized = true; result(m.id, { codexHome: process.env.CODEX_HOME }); }
  else if (m.method === 'initialized') acknowledged = true;
  else if (m.method === 'thread/start') {
    if (!initialized || !acknowledged || m.params.ephemeral !== true) process.exit(8);
    result(m.id, { thread: { id: 'local-fixture-thread' } });
  } else if (m.method === 'mcpServer/tool/call') {
    calls++;
    if (mode === 'timeout') continue;
    if (mode === 'exit') process.exit(9);
    if (mode === 'model-turn') { send({ method: 'turn/started', params: {} }); continue; }
    if (mode === 'model-item') { send({ method: 'item/started', params: {} }); continue; }
    if (mode === 'bad-json') { process.stdout.write('{broken\n'); continue; }
    if (mode === 'bad-result') { result(m.id, { content: [{ type: 'image', data: 42 }] }); continue; }
    if (mode === 'native-error') { result(m.id, { content: [{ type: 'text', text: 'Native failure' }], isError: true }); continue; }
    if (mode === 'consent') { pending.set('approve1', m.id); send({ id: 'approve1', method: 'mcpServer/elicitation/request', params: { mode: 'form', message: 'Allow Finder?', requestedSchema: { type: 'object', properties: {} } } }); continue; }
    if (mode === 'child') child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' });
    result(m.id, content());
  } else if (m.id) { send({ id: m.id, error: { code: -32601, message: 'Unexpected method ' + m.method } }); }
}
if (child) child.unref();
