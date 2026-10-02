import { EventEmitter } from 'node:events';

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const isId = value => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
const keyOf = id => `${typeof id}:${id}`;

export class RpcError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// One bounded UTF-8 JSON object per line. Diagnostics never share stdout.
export class JsonLines extends EventEmitter {
  constructor(input, output, { maxBytes = 32 * 1024 * 1024 } = {}) {
    super();
    this.input = input; this.output = output; this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0); this.closed = false; this.writes = Promise.resolve();
    this.onData = chunk => {
      if (this.closed) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let start = 0;
      for (;;) {
        const end = bytes.indexOf(10, start);
        const part = bytes.subarray(start, end < 0 ? bytes.length : end);
        if (this.buffer.length + part.length > this.maxBytes) {
          this.emit('fault', new RpcError(-32600, 'JSON frame exceeds size limit')); this.close(); return;
        }
        this.buffer = Buffer.concat([this.buffer, part]);
        if (end < 0) break;
        const frame = this.buffer; this.buffer = Buffer.alloc(0);
        if (frame.toString().trim()) {
          let message;
          try { message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(frame)); }
          catch { this.emit('fault', new RpcError(-32700, 'Invalid JSON')); start = end + 1; continue; }
          this.emit('message', message);
        }
        if (this.closed) return;
        start = end + 1;
      }
    };
    this.onEnd = () => {
      if (this.buffer.length && this.buffer.toString().trim()) this.emit('fault', new RpcError(-32700, 'Truncated JSON frame'));
      this.close(); this.emit('end');
    };
    this.onError = error => { this.emit('fault', error); this.close(); this.emit('end'); };
    input.on('data', this.onData); input.once('end', this.onEnd); input.on('error', this.onError);
    output.on('error', this.onError);
  }
  send(value) {
    let line;
    try { line = JSON.stringify(value) + '\n'; } catch (error) { return Promise.reject(error); }
    if (Buffer.byteLength(line) > this.maxBytes + 1) return Promise.reject(new RpcError(-32603, 'Output frame exceeds size limit'));
    const write = () => new Promise((resolve, reject) => {
      if (this.closed || this.output.destroyed) return reject(new Error('Transport closed'));
      this.output.write(line, error => error ? reject(error) : resolve());
    });
    const result = this.writes.then(write);
    this.writes = result.catch(() => {});
    return result;
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.buffer = Buffer.alloc(0);
    this.input.off('data', this.onData); this.input.off('end', this.onEnd);
    this.input.off('error', this.onError); this.output.off('error', this.onError);
  }
}

export class RpcPeer extends EventEmitter {
  constructor(input, output, options) {
    super(); this.pending = new Map(); this.serial = 0; this.closed = false;
    this.wire = new JsonLines(input, output, options);
    this.wire.on('message', message => {
      if (!isObject(message)) { this.fail(new Error('Invalid protocol envelope')); return; }
      if (isId(message.id) && !message.method) {
        const pending = this.pending.get(keyOf(message.id));
        if (!pending) return;
        this.pending.delete(keyOf(message.id)); pending.dispose();
        if (isObject(message.error)) pending.reject(new RpcError(message.error.code ?? -32603, message.error.message ?? 'RPC failed'));
        else if (Object.hasOwn(message, 'result')) pending.resolve(message.result);
        else pending.reject(new Error('RPC response has no result'));
      } else this.emit('message', message);
    });
    this.wire.on('fault', error => this.fail(error));
    this.wire.on('end', () => this.fail(new Error('RPC stream ended')));
  }
  request(method, params = {}, { timeoutMs = 30000, signal } = {}) {
    if (this.closed) return Promise.reject(new Error('RPC peer closed'));
    if (signal?.aborted) return Promise.reject(new Error('Request cancelled'));
    if (this.pending.size >= 128) return Promise.reject(new Error('Too many pending requests'));
    const id = `r${++this.serial}`;
    return new Promise((resolve, reject) => {
      const finish = error => {
        const entry = this.pending.get(keyOf(id));
        if (!entry) return;
        this.pending.delete(keyOf(id)); entry.dispose(); reject(error);
      };
      const aborted = () => finish(new Error('Request cancelled'));
      const timer = setTimeout(() => finish(new Error(`RPC timeout: ${method}`)), timeoutMs);
      this.pending.set(keyOf(id), {
        resolve, reject,
        dispose: () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); }
      });
      signal?.addEventListener('abort', aborted, { once: true });
      this.send({ id, method, params }).catch(finish);
    });
  }
  send(message) { return this.wire.send({ jsonrpc: '2.0', ...message }); }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) { entry.dispose(); entry.reject(error); }
    this.pending.clear(); this.wire.close(); this.emit('closed', error);
  }
  close() { this.fail(new Error('RPC peer closed')); }
}
