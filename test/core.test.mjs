import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtemp, mkdir, readFile, lstat, realpath, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { JsonLines, RpcPeer } from '../lib/rpc.mjs';
import { createIsolation, DISABLED_CONFIG, run } from '../lib/runtime.mjs';
import { acquireLock } from '../lib/processes.mjs';
import { createSession, ComputerUse, validateResult } from '../lib/computer-use.mjs';
import { TOOLS, validateArguments } from '../lib/tools.mjs';
import { makeLauncher, quote } from '../lib/install.mjs';

const fixture = fileURLToPath(new URL('./fixtures/app-server.mjs', import.meta.url));
async function temporary(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cu-test-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
}
async function fakeSession(t, mode = 'normal', timeout = 3000) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'cu-test-')), app = path.join(dir, 'Test App.app'); await mkdir(app);
  const runtime = { codex: process.execPath, client: fixture, service: '/nonexistent/test-service', app, brokerVersion: 'fixture', clientBuild: 'fixture' };
  const session = await createSession({ resolve: () => runtime, stateDir: path.join(dir, 'state'), requestTimeoutMs: timeout,
    launch: (_file, _args, options) => spawn(process.execPath, [fixture, mode], options) });
  t.after(async () => { try { await session.close(); } finally { await rm(dir, { recursive: true, force: true }); } }); return session;
}

test('tool surface has 10 native methods and one status method', () => {
  assert.equal(TOOLS.length, 11); assert.equal(new Set(TOOLS.map(t => t.name)).size, 11);
});
for (const [name, args] of [
  ['list_apps', {}], ['get_app_state', { app: 'Finder' }], ['click', { app: 'Finder', element_index: '1' }],
  ['click', { app: 'Finder', x: 0, y: 1 }], ['perform_secondary_action', { app: 'Finder', element_index: '1', action: 'Raise' }],
  ['set_value', { app: 'Finder', element_index: '1', value: '' }], ['select_text', { app: 'Finder', element_index: '1', text: 'hello' }],
  ['scroll', { app: 'Finder', element_index: '1', direction: 'down', pages: 0.5 }],
  ['drag', { app: 'Finder', from_x: 1, from_y: 2, to_x: 3, to_y: 4 }],
  ['press_key', { app: 'Finder', key: 'Escape' }], ['type_text', { app: 'Finder', text: '你好' }]
]) test(`valid arguments: ${name} ${JSON.stringify(args)}`, () => assert.deepEqual(validateArguments(name, args), args));
for (const [label, name, args] of [
  ['unknown method', 'exec', {}], ['missing app', 'get_app_state', {}], ['empty app', 'get_app_state', { app: '' }],
  ['missing click target', 'click', { app: 'Finder' }], ['partial coordinates', 'click', { app: 'Finder', x: 1 }],
  ['nonfinite number', 'click', { app: 'Finder', x: Infinity, y: 1 }], ['bad click count', 'click', { app: 'Finder', element_index: '1', click_count: -1 }],
  ['unknown key', 'list_apps', { command: 'x' }], ['array input', 'list_apps', []],
  ['wrong type', 'type_text', { app: 'Finder', text: false }], ['bad direction', 'scroll', { app: 'Finder', element_index: '1', direction: 'north' }],
  ['nonpositive pages', 'scroll', { app: 'Finder', element_index: '1', direction: 'down', pages: 0 }]
]) test(`invalid arguments: ${label}`, () => assert.throws(() => validateArguments(name, args)));
test('one MiB input bound', () => assert.throws(() => validateArguments('type_text', { app: 'Finder', text: 'x'.repeat(1024 * 1024) })));
test('native response shape checked', () => {
  for (const bad of [null, [], {}, { content: 'bad' }, { content: [{ type: 'text', text: 5 }] }, { content: [{ type: 'image', data: 1 }] }]) assert.throws(() => validateResult(bad));
});
test('JSONL handles split Unicode, CRLF and multiple frames', () => {
  const input = new PassThrough(), wire = new JsonLines(input, new PassThrough()), seen = [];
  wire.on('message', m => seen.push(m)); wire.on('fault', e => assert.fail(e));
  const data = Buffer.from('{"x":"你好"}\r\n{"id":2}\n');
  for (const byte of data) input.write(Buffer.from([byte]));
  assert.deepEqual(seen, [{ x: '你好' }, { id: 2 }]); wire.close();
});
test('JSONL rejects invalid JSON without losing the next frame', () => {
  const input = new PassThrough(), wire = new JsonLines(input, new PassThrough()); const faults = [], seen = [];
  wire.on('fault', e => faults.push(e.code)); wire.on('message', m => seen.push(m)); input.write('bad\n{"ok":true}\n');
  assert.deepEqual(faults, [-32700]); assert.deepEqual(seen, [{ ok: true }]); wire.close();
});
test('JSONL rejects oversized incomplete frames', () => {
  const input = new PassThrough(), wire = new JsonLines(input, new PassThrough(), { maxBytes: 20 });
  let fault; wire.on('fault', e => { fault = e; }); input.write('x'.repeat(21)); assert.ok(fault); assert.equal(wire.closed, true);
});
test('JSONL signals truncated input on EOF', () => {
  const input = new PassThrough(), wire = new JsonLines(input, new PassThrough());
  return new Promise(resolve => { wire.on('fault', error => { assert.equal(error.code, -32700); }); wire.on('end', resolve); input.end('{'); });
});
test('RPC correlates out-of-order responses', async () => {
  const input = new PassThrough(), output = new PassThrough(), peer = new RpcPeer(input, output);
  const a = peer.request('a'), b = peer.request('b');
  input.write('{"id":"r2","result":2}\n{"id":"r1","result":1}\n');
  assert.equal(await b, 2); assert.equal(await a, 1); peer.close();
});
test('RPC rejects on timeout', async () => {
  const peer = new RpcPeer(new PassThrough(), new PassThrough());
  await assert.rejects(peer.request('slow', {}, { timeoutMs: 20 }), /timeout/); assert.equal(peer.pending.size, 0); peer.close();
});
test('RPC rejects on cancellation and releases pending entry', async () => {
  const peer = new RpcPeer(new PassThrough(), new PassThrough()), abort = new AbortController();
  const result = peer.request('slow', {}, { signal: abort.signal }); abort.abort();
  await assert.rejects(result, /cancelled/); assert.equal(peer.pending.size, 0); peer.close();
});
test('isolation has private paths, runtime mapping and no inherited credentials', async t => {
  const dir = await temporary(t), app = path.join(dir, 'Official Runtime.app'); await mkdir(app);
  const isolation = await createIsolation({ codex: '/Applications/ChatGPT.app/Contents/Resources/codex', app, client: '/client' }, { tempDir: dir, parentEnv: { USER: 'tester', OPENAI_API_KEY: 'secret', NODE_OPTIONS: '--require=bad', CODEX_HOME: '/real-account', SSH_AUTH_SOCK: '/secret' } });
  assert.equal((await lstat(isolation.root)).mode & 0o777, 0o700);
  assert.equal((await lstat(path.join(isolation.home, 'config.toml'))).mode & 0o777, 0o600);
  assert.equal(await realpath(path.join(isolation.home, 'computer-use/Codex Computer Use.app')), await realpath(app));
  for (const key of ['OPENAI_API_KEY', 'NODE_OPTIONS', 'SSH_AUTH_SOCK']) assert.equal(isolation.env[key], undefined);
  assert.notEqual(isolation.env.CODEX_HOME, '/real-account'); assert.equal(existsSync(path.join(isolation.home, 'auth.json')), false);
  assert.match(isolation.env.PATH, /^\/Applications\/ChatGPT.app\/Contents\/Resources:/);
  const config = await readFile(path.join(isolation.home, 'config.toml'), 'utf8');
  assert.match(config, /requires_openai_auth = false/); assert.match(config, /127\.0\.0\.1:9/); assert.match(config, /cli_auth_credentials_store = "file"/);
  assert.match(isolation.args[1], /env = \{ HOME/); assert.match(isolation.args[1], /CODEX_SQLITE_HOME/);
});
test('lock refuses another session and releases only its own lock', async t => {
  const dir = await temporary(t), lock = path.join(dir, 'private/session.lock');
  const release = await acquireLock(lock); await assert.rejects(acquireLock(lock), /Another session/); await release(); assert.equal(existsSync(lock), false);
});
test('native broker handshake, result passthrough and cleanup', async t => {
  const session = await fakeSession(t), root = session.isolation.root;
  const result = await session.call('get_app_state', { app: 'Finder' });
  assert.equal(result.isError, false); assert.equal(result.modelTurnsStarted, 0); assert.equal(result.content[1].data, 'ZmFrZQ==');
  const info = JSON.parse(result.content[0].text); assert.equal(info.acknowledged, true); assert.equal(info.env.CODEX_HOME, session.isolation.home);
  await session.close(); assert.equal(existsSync(root), false);
});
for (const mode of ['model-turn', 'model-item', 'bad-json', 'bad-result', 'exit']) test(`broker rejects ${mode} and cleans up`, async t => {
  const session = await fakeSession(t, mode), root = session.isolation.root;
  await assert.rejects(session.call('get_app_state', { app: 'Finder' })); await session.close(); assert.equal(existsSync(root), false);
});
test('broker cancels native request and removes isolated home', async t => {
  const session = await fakeSession(t, 'timeout'), abort = new AbortController(), root = session.isolation.root;
  const pending = session.call('get_app_state', { app: 'Finder' }, { signal: abort.signal }); setTimeout(() => abort.abort(), 30);
  await assert.rejects(pending, /cancelled/); await session.close(); assert.equal(existsSync(root), false);
});
test('broker timeout triggers teardown', async t => {
  const session = await fakeSession(t, 'timeout', 500);
  await assert.rejects(session.call('get_app_state', { app: 'Finder' }), /timeout/);
});
test('consent cancels by default instead of auto-approving', async t => {
  const session = await fakeSession(t, 'consent'); const result = await session.call('get_app_state', { app: 'Finder' });
  assert.equal(JSON.parse(result.content[0].text).action, 'cancel');
});
test('consent forwards explicit user answer', async t => {
  const session = await fakeSession(t, 'consent'); let message;
  const result = await session.call('get_app_state', { app: 'Finder' }, { onElicitation: request => { message = request.message; return { action: 'decline' }; } });
  assert.equal(message, 'Allow Finder?'); assert.equal(JSON.parse(result.content[0].text).action, 'decline');
});
test('cleanup terminates a detached descendant without broad process matching', async t => {
  const session = await fakeSession(t, 'child'); const result = await session.call('get_app_state', { app: 'Finder' });
  const pid = JSON.parse(result.content[0].text).childPid; assert.ok(pid > 1);
  await session.close();
  let state = ''; try { state = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8' }).trim(); } catch {}
  assert.ok(!state || state.startsWith('Z'));
});
test('native error remains an error rather than a success envelope', async t => {
  const session = await fakeSession(t, 'native-error'); assert.equal((await session.call('get_app_state', { app: 'Finder' })).isError, true);
});
test('spawn failure cleans up without hanging', async t => {
  const dir = await temporary(t), app = path.join(dir, 'App'); await mkdir(app);
  await assert.rejects(createSession({ resolve: () => ({ codex: '/missing/executable', app, client: '/client', service: '/service' }), stateDir: path.join(dir, 'state') }));
  assert.equal(existsSync(path.join(dir, 'state/session.lock')), false);
});
function fakeComputer(idleMs = 1000) {
  const events = []; let opened = 0, stopped = 0;
  const computer = new ComputerUse({ idleMs, factory: async () => { opened++; return { call: async (name, args) => { events.push(name); await new Promise(r => setTimeout(r, 10)); return { content: [{ type: 'text', text: args.app ?? '' }], isError: false, modelTurnsStarted: 0 }; }, close: async () => { stopped++; } }; } });
  return { computer, events, opened: () => opened, stopped: () => stopped };
}
test('session reused and calls serialized', async () => {
  const x = fakeComputer(); await x.computer.execute('get_app_state', { app: 'Finder' });
  await Promise.all([x.computer.execute('click', { app: 'Finder', element_index: '1' }), x.computer.execute('get_app_state', { app: 'Finder' })]);
  assert.equal(x.opened(), 1); assert.deepEqual(x.events, ['get_app_state', 'click', 'get_app_state']); await x.computer.close(); assert.equal(x.stopped(), 1);
});
test('action requires state for exact app target', async () => {
  const x = fakeComputer(); await assert.rejects(x.computer.execute('click', { app: 'Finder', element_index: '1' }), /get_app_state/);
  assert.equal(x.opened(), 0); await x.computer.close();
});
test('idle expiry closes session and invalidates element context', async () => {
  const x = fakeComputer(20); await x.computer.execute('get_app_state', { app: 'Finder' }); await new Promise(r => setTimeout(r, 60));
  assert.equal(x.stopped(), 1); await assert.rejects(x.computer.execute('click', { app: 'Finder', element_index: '1' })); await x.computer.close();
});
test('launcher refuses arguments, drops root, and uses fixed quoted paths', () => {
  const script = makeLauncher({ username: 'macuser', uid: 501, home: '/Users/mac user', wrapper: "/Users/mac user/a'b/mcp" });
  assert.match(script, /No arguments allowed/); assert.match(script, /launchctl asuser 501/); assert.match(script, /sudo -n -u 'macuser' -H/); assert.match(script, /env -i/);
  assert.ok(script.includes(quote("/Users/mac user/a'b/mcp"))); assert.throws(() => makeLauncher({ username: 'x;id', uid: 501, home: '/home' }));
});
test('dummy provider never configures an API key or remote model endpoint', () => {
  assert.doesNotMatch(DISABLED_CONFIG, /api\.openai\.com|env_key|api_key/); assert.match(DISABLED_CONFIG, /mcp_servers = \{\}/);
});

test('command runner accepts commands with inherited or ignored stdio', () => assert.equal(run(process.execPath, ['-e', ''], { stdio: 'ignore' }), ''));
