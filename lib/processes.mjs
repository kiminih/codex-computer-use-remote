import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

export async function acquireLock(directory) {
  await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
  const parent = await lstat(path.dirname(directory));
  if (parent.isSymbolicLink() || (parent.mode & 0o022)) throw new Error('Session state directory must be private and not a symlink');
  const nonce = randomUUID();
  try { await mkdir(directory, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Another session owns ${directory}. Close other sessions; see docs/TROUBLESHOOTING.md for stale locks.`);
  }
  try { await writeFile(path.join(directory, 'owner.json'), JSON.stringify({ pid: process.pid, nonce }), { flag: 'wx', mode: 0o600 }); }
  catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  return async () => {
    const owner = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8'));
    if (owner.nonce !== nonce) throw new Error('Session lock ownership changed; refusing removal');
    await rm(directory, { recursive: true });
  };
}

function processTable() {
  const output = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart=,comm='], { encoding: 'utf8', timeout: 5000, maxBuffer: 8 * 1024 * 1024 });
  const entries = new Map();
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+((?:\S+\s+){4}\S+)\s+(.+)$/);
    if (match) {
      const [, pid, ppid, pgid, state, born, command] = match;
      entries.set(Number(pid), { pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid), state, identity: born + ' ' + command, command });
    }
  }
  if (!entries.size) throw new Error('Could not parse process table');
  return entries;
}

// Only this private session's descendants and explicitly matched native service.
// Never use broad pkill, and never signal a PID whose identity has changed.
export class ProcessOwner {
  constructor(child, isolation, runtime) {
    this.child = child; this.isolation = isolation; this.runtime = runtime;
    this.owned = new Map(); this.failure = null;
    this.sample();
    this.timer = setInterval(() => { try { this.sample(); } catch (e) { this.failure = e; } }, 500);
    this.timer.unref();
  }
  sample() {
    const table = processTable();
    const root = table.get(this.child.pid);
    if (root && (!this.owned.has(root.pid) || this.owned.get(root.pid) === root.identity)) this.owned.set(root.pid, root.identity);
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of table.values()) {
        const parent = table.get(entry.ppid);
        if (entry.pid !== process.pid && parent && this.owned.get(parent.pid) === parent.identity && !this.owned.has(entry.pid)) {
          this.owned.set(entry.pid, entry.identity); changed = true;
        }
      }
      if (this.owned.size > 256) throw new Error('Session process count exceeded cleanup limit');
    }
    if (process.platform === 'darwin') {
      for (const entry of table.values()) {
        if (entry.command !== this.runtime.service) continue;
        try {
          const text = execFileSync('/bin/ps', ['eww', '-p', String(entry.pid), '-o', 'command='], { encoding: 'utf8', timeout: 2000 });
          const marker = `CODEX_HOME=${this.isolation.home}`;
          if (text.includes(' ' + marker + ' ') || text.trimEnd().endsWith(' ' + marker)) this.owned.set(entry.pid, entry.identity);
        } catch { /* A disappearing native process is harmless. */ }
      }
    }
    return table;
  }
  async close() {
    clearInterval(this.timer);
    const signalOwned = signal => {
      const table = this.sample();
      for (const [pid, identity] of [...this.owned].reverse()) {
        const entry = table.get(pid);
        if (!entry || entry.identity !== identity || entry.state.startsWith('Z') || pid <= 1 || pid === process.pid) continue;
        try { process.kill(pid, signal); } catch (e) { if (e.code !== 'ESRCH') throw e; }
      }
    };
    let cleanupError;
    try {
      signalOwned('SIGTERM');
      for (let n = 0; n < 15; n++) {
        await delay(50);
        const table = this.sample();
        if (![...this.owned].some(([pid, identity]) => table.get(pid)?.identity === identity && !table.get(pid).state.startsWith('Z'))) {
          if (this.failure) throw this.failure;
          return;
        }
      }
      signalOwned('SIGKILL');
      for (let n = 0; n < 20; n++) {
        await delay(50);
        const table = this.sample();
        if (![...this.owned].some(([pid, identity]) => table.get(pid)?.identity === identity && !table.get(pid).state.startsWith('Z'))) {
          if (this.failure) throw this.failure;
          return;
        }
      }
      cleanupError = new Error('Session-owned processes remain after cleanup');
    } catch (error) { cleanupError = error; }
    // If enumeration fails, stop the still-owned direct child, but do not claim verification.
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL');
    throw cleanupError;
  }
}
