#!/usr/bin/env node
import { VERSION, status } from '../lib/runtime.mjs';
import { ComputerUse } from '../lib/computer-use.mjs';
import { serve } from '../lib/mcp-stdio.mjs';

if (Number(process.versions.node.split('.')[0]) < 22) { console.error('Node.js 22+ is required'); process.exit(1); }
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--version') console.log(`codex-computer-use-remote ${VERSION}`);
else if (args.length === 1 && args[0] === '--status') {
  const result = status(); console.log(JSON.stringify(result, null, 2)); if (!result.brokerVerified) process.exitCode = 1;
} else if (args.length === 1 && args[0] === '--smoke') {
  const computer = new ComputerUse();
  let result, cleanup = false;
  try { result = await computer.execute('get_app_state', { app: 'Finder' }); }
  catch (error) { result = { isError: true, content: [{ type: 'text', text: error.message }] }; }
  try { await computer.close(); cleanup = true; } catch (error) { console.error(error.message); }
  console.log(JSON.stringify({ ...result, brokerCleanupVerified: cleanup, content: result.content.map(item => ['image', 'audio'].includes(item.type) ? { ...item, data: '<omitted>' } : item) }, null, 2));
  if (result.isError || result.modelTurnsStarted !== 0 || !cleanup) process.exitCode = 1;
} else if (args.length) { console.error('Usage: mac-computer-use-mcp [--version|--status|--smoke]'); process.exitCode = 2; }
else {
  const server = serve();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(signal, () => { void server.close(); });
  try { await server.done; process.stdin.pause(); }
  catch (error) { console.error(error.message); process.exitCode = 1; process.stdin.pause(); }
}
