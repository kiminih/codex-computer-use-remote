import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { RpcPeer, isObject, isId } from './rpc.mjs';
import { createIsolation, resolveRuntime, STATE_DIR, VERSION } from './runtime.mjs';
import { acquireLock, ProcessOwner } from './processes.mjs';
import { isAction, validateArguments } from './tools.mjs';

export function validateResult(value) {
  if (!isObject(value) || !Array.isArray(value.content) || (value.isError !== undefined && typeof value.isError !== 'boolean')) throw new Error('Invalid Computer Use result');
  for (const item of value.content) {
    if (!isObject(item) || !['text', 'image', 'audio', 'resource', 'resource_link'].includes(item.type)) throw new Error('Invalid Computer Use content');
    if (item.type === 'text' && typeof item.text !== 'string') throw new Error('Invalid text result');
    if (['image', 'audio'].includes(item.type) && (typeof item.data !== 'string' || typeof item.mimeType !== 'string')) throw new Error('Invalid media result');
  }
  return { content: value.content, isError: value.isError === true, ...(value.structuredContent === undefined ? {} : { structuredContent: value.structuredContent }) };
}

// Dependency injection is limited to this module API for tests; no CLI flag or
// environment variable disables signature verification in the production server.
export async function createSession({ resolve = resolveRuntime, launch = spawn, stateDir = STATE_DIR, requestTimeoutMs = 120000, signal } = {}) {
  signal?.throwIfAborted();
  const runtime = resolve();
  const release = await acquireLock(path.join(stateDir, 'session.lock'));
  let isolation, child, owner, peer, closePromise, fatal;
  let modelTurnsStarted = 0, elicitation = null, threadId, active = false;
  const close = () => {
    closePromise ??= (async () => {
      peer?.close();
      try {
        await owner?.close();
        if (child?.pid && !owner && child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await new Promise(resolve => { if (child.exitCode !== null || child.signalCode !== null) resolve(); else child.once('exit', resolve); });
        }
        if (isolation) await rm(isolation.root, { recursive: true, force: true });
        await release();
      } catch (error) {
        throw new Error('Cleanup not verified; private directory and lock retained for diagnosis', { cause: error });
      }
    })();
    return closePromise;
  };
  try {
    isolation = await createIsolation(runtime);
    signal?.throwIfAborted();
    child = launch(runtime.codex, isolation.args, { cwd: isolation.work, env: isolation.env, detached: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    // Drain stderr without exposing account data or screenshot content in logs.
    let stderr = '';
    child.stderr.on('data', chunk => { if (stderr.length < 4096) stderr += chunk.toString().slice(0, 4096 - stderr.length); });
    child.stdin.on('error', () => {});
    peer = new RpcPeer(child.stdout, child.stdin);
    peer.on('closed', error => { fatal ??= error; });
    child.once('error', error => peer.fail(error));
    child.once('exit', (code, killed) => peer.fail(new Error(`App-server exited (code=${code}, signal=${killed})`)));
    if (child.pid) owner = new ProcessOwner(child, isolation, runtime);
    peer.on('message', message => {
      if (typeof message.method !== 'string') return;
      if (message.method.startsWith('turn/') || message.method.startsWith('item/')) {
        modelTurnsStarted++;
        fatal = new Error('Unexpected model-turn activity; direct session stopped');
        peer.fail(fatal); void close().catch(() => {}); return;
      }
      if (!isId(message.id)) return;
      if (message.method !== 'mcpServer/elicitation/request') {
        void peer.send({ id: message.id, error: { code: -32601, message: 'Unsupported server request' } }).catch(() => {}); return;
      }
      void (async () => {
        let answer = { action: 'cancel' };
        try { if (elicitation) answer = await elicitation(message.params); } catch {}
        if (!isObject(answer) || !['accept', 'decline', 'cancel'].includes(answer.action)) answer = { action: 'cancel' };
        if (!peer.closed) await peer.send({ id: message.id, result: answer });
      })().catch(error => peer.fail(error));
    });
    await peer.request('initialize', {
      clientInfo: { name: 'codex_computer_use_remote', title: 'Computer Use Remote', version: VERSION },
      capabilities: { experimentalApi: true, requestAttestation: false }
    }, { timeoutMs: Math.min(15000, requestTimeoutMs), signal });
    await peer.send({ method: 'initialized' });
    const started = await peer.request('thread/start', {
      cwd: isolation.work, ephemeral: true, approvalPolicy: 'never', sandbox: 'danger-full-access', serviceName: 'codex_computer_use_remote'
    }, { timeoutMs: Math.min(30000, requestTimeoutMs), signal });
    if (typeof started?.thread?.id !== 'string') throw new Error('App-server did not return a thread ID');
    threadId = started.thread.id;
  } catch (error) {
    try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Startup and cleanup failed'); }
    throw error;
  }
  return {
    runtime, isolation,
    get modelTurnsStarted() { return modelTurnsStarted; },
    async call(method, args, { signal: callSignal, onElicitation } = {}) {
      validateArguments(method, args);
      if (fatal || closePromise) throw fatal ?? new Error('Session closed');
      if (active) throw new Error('Concurrent native calls are not supported');
      active = true; elicitation = onElicitation;
      try {
        const raw = await peer.request('mcpServer/tool/call', { threadId, server: 'computer-use', tool: method, arguments: args }, { timeoutMs: requestTimeoutMs, signal: callSignal });
        if (fatal || modelTurnsStarted) throw fatal ?? new Error('Model-turn guard failed');
        owner?.sample();
        return { ...validateResult(raw), modelTurnsStarted, brokerVersion: runtime.brokerVersion, clientBuild: runtime.clientBuild };
      } catch (error) {
        try { await close(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Request and cleanup failed'); }
        throw error;
      } finally { active = false; elicitation = null; }
    }, close
  };
}

export class ComputerUse {
  constructor({ factory = createSession, idleMs = 120000 } = {}) {
    this.factory = factory; this.idleMs = idleMs; this.queue = Promise.resolve(); this.apps = new Set();
    this.session = null; this.timer = null; this.closed = false; this.failure = null;
    this.lifetime = new AbortController();
  }
  exclusive(work) {
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  async reset() {
    clearTimeout(this.timer); this.timer = null; this.apps.clear();
    const session = this.session; this.session = null;
    await session?.close();
  }
  execute(method, args, options = {}) {
    validateArguments(method, args);
    return this.exclusive(async () => {
      if (this.closed) throw new Error('Computer Use closed');
      if (this.failure) throw this.failure;
      const signal = options.signal ? AbortSignal.any([this.lifetime.signal, options.signal]) : this.lifetime.signal;
      signal.throwIfAborted();
      clearTimeout(this.timer);
      try {
        if (isAction(method) && !this.apps.has(args.app)) throw new Error('Read get_app_state for this exact app target before an action');
        this.session ??= await this.factory({ signal });
        const result = await this.session.call(method, args, { ...options, signal });
        if (result.isError) await this.reset();
        else {
          if (method === 'get_app_state') this.apps.add(args.app);
          this.timer = setTimeout(() => { void this.exclusive(() => this.reset()).catch(error => { this.failure = error; }); }, this.idleMs);
          this.timer.unref();
        }
        return result;
      } catch (error) {
        try { await this.reset(); } catch (cleanup) { this.failure = cleanup; throw new AggregateError([error, cleanup], 'Session cleanup failed'); }
        throw error;
      }
    });
  }
  close() {
    this.closed = true; this.lifetime.abort();
    return this.exclusive(async () => { await this.reset(); if (this.failure) throw this.failure; });
  }
}
