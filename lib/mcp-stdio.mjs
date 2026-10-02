import { JsonLines, isObject, isId, RpcError } from './rpc.mjs';
import { TOOLS, validateArguments } from './tools.mjs';
import { VERSION, status as runtimeStatus } from './runtime.mjs';
import { ComputerUse } from './computer-use.mjs';

// Deliberately implements the negotiated 2025 stdio profile, not HTTP, sampling,
// tasks, or later protocol drafts. Unknown versions negotiate down explicitly.
export const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
export function serve({ input = process.stdin, output = process.stdout, computer = new ComputerUse(), status = runtimeStatus, maxBytes } = {}) {
  const wire = new JsonLines(input, output, { maxBytes });
  let initialized = false, ready = false, stopping = false, serial = 0, clientCaps = {}, closing;
  const active = new Map(), outgoing = new Map();
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const send = message => wire.send({ jsonrpc: '2.0', ...message });
  const keyOf = id => `${typeof id}:${id}`;
  const shutdown = () => {
    closing ??= (async () => {
      stopping = true;
      for (const request of active.values()) request.abort();
      for (const request of outgoing.values()) request.finish({ action: 'cancel' });
      try { await computer.close(); await wire.writes; wire.close(); resolveDone(); }
      catch (error) { wire.close(); rejectDone(error); }
    })();
    return closing;
  };
  const elicit = (params, signal) => {
    if (!isObject(params)) return Promise.resolve({ action: 'cancel' });
    const mode = params.mode ?? 'form';
    const enabled = isObject(clientCaps.elicitation) && (mode === 'form' || Object.hasOwn(clientCaps.elicitation, 'url'));
    if (!enabled || !['form', 'url'].includes(mode)) return Promise.resolve({ action: 'cancel' });
    if (typeof params.message !== 'string' || (mode === 'form' && !isObject(params.requestedSchema)) || (mode === 'url' && (typeof params.url !== 'string' || typeof params.elicitationId !== 'string'))) return Promise.resolve({ action: 'cancel' });
    if (signal.aborted) return Promise.resolve({ action: 'cancel' });
    const id = `consent-${++serial}`;
    return new Promise(resolve => {
      const finish = answer => {
        if (!outgoing.has(id)) return;
        outgoing.delete(id); clearTimeout(timer); signal.removeEventListener('abort', aborted);
        resolve(isObject(answer) && ['accept', 'decline', 'cancel'].includes(answer.action) ? answer : { action: 'cancel' });
      };
      const aborted = () => finish({ action: 'cancel' });
      const timer = setTimeout(aborted, 60000);
      outgoing.set(id, { finish }); signal.addEventListener('abort', aborted, { once: true });
      const forwarded = { mode, message: params.message };
      for (const key of (mode === 'form' ? ['requestedSchema', '_meta'] : ['url', 'elicitationId', '_meta'])) if (params[key] !== undefined) forwarded[key] = params[key];
      send({ id, method: 'elicitation/create', params: forwarded }).catch(aborted);
    });
  };
  wire.on('message', message => {
    void (async () => {
      if (stopping) return;
      if (!isObject(message) || message.jsonrpc !== '2.0') throw new RpcError(-32600, 'Invalid JSON-RPC request');
      if (!message.method && typeof message.id === 'string' && outgoing.has(message.id)) {
        outgoing.get(message.id).finish(message.result); return;
      }
      if (!Object.hasOwn(message, 'id')) {
        if (message.method === 'notifications/initialized' && initialized) ready = true;
        if (message.method === 'notifications/cancelled' && isId(message.params?.requestId)) active.get(keyOf(message.params.requestId))?.abort();
        return;
      }
      if (!isId(message.id) || typeof message.method !== 'string') throw new RpcError(-32600, 'Invalid request ID or method');
      const { id, method } = message;
      const key = keyOf(id);
      if (active.has(key)) throw new RpcError(-32600, 'Duplicate in-flight request ID');
      if (active.size >= 32) throw new RpcError(-32000, 'Too many in-flight requests');
      const abort = new AbortController(); active.set(key, abort);
      try {
        let result;
        if (method === 'initialize') {
          if (initialized) throw new RpcError(-32600, 'Already initialized');
          const params = message.params;
          if (!isObject(params) || typeof params.protocolVersion !== 'string' || !isObject(params.capabilities) || typeof params.clientInfo?.name !== 'string' || typeof params.clientInfo?.version !== 'string') throw new RpcError(-32602, 'Invalid initialize parameters');
          clientCaps = params.capabilities; initialized = true;
          result = { protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0], capabilities: { tools: {} }, serverInfo: { name: 'codex-computer-use-remote', version: VERSION }, instructions: 'Read get_app_state before actions; reuse the exact app target. macOS permissions and runtime consent still apply.' };
        } else if (method === 'ping') result = {};
        else {
          if (!ready) throw new RpcError(-32002, 'Not initialized');
          if (method === 'tools/list') result = { tools: TOOLS };
          else if (method === 'tools/call') {
            const { name, arguments: args = {} } = message.params ?? {};
            validateArguments(name, args);
            try {
              if (name === 'computer_use_status') {
                const current = status(); result = { content: [{ type: 'text', text: JSON.stringify(current) }], structuredContent: current };
              } else {
                const native = await computer.execute(name, args, { signal: abort.signal, onElicitation: params => elicit(params, abort.signal) });
                result = { content: native.content, isError: native.isError, ...(native.structuredContent === undefined ? {} : { structuredContent: native.structuredContent }) };
              }
            } catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message ?? 'Computer Use failed' }] }; }
          } else throw new RpcError(-32601, 'Method not found');
        }
        if (!abort.signal.aborted && !stopping) await send({ id, result });
      } finally { active.delete(key); }
    })().catch(error => {
      const id = isObject(message) && isId(message.id) ? message.id : null;
      if (!stopping) void send({ id, error: { code: error.code ?? -32603, message: error.message ?? 'Internal error' } }).catch(shutdown);
    });
  });
  wire.on('fault', error => { if (!stopping) void send({ id: null, error: { code: error.code ?? -32603, message: error.message } }).catch(shutdown); });
  wire.on('end', shutdown);
  return { close: shutdown, done };
}
