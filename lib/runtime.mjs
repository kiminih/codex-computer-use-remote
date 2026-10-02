import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const VERSION = '0.2.0';
export const TEAM_ID = '2DC432GLL2';
export const CHATGPT_APP = '/Applications/ChatGPT.app';
export const CLIENT_REL = 'Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient';
export const SERVICE_REL = 'Contents/MacOS/SkyComputerUseService';
export const ACCOUNT_HOME = os.userInfo().homedir;
export const STATE_DIR = path.join(ACCOUNT_HOME, '.local/state/codex-computer-use-remote');
export const RUNTIME_APP = path.join(ACCOUNT_HOME, '.codex/computer-use/Codex Computer Use.app');
export const CODEX_CANDIDATES = [
  `${CHATGPT_APP}/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`,
  `${CHATGPT_APP}/Contents/Resources/codex`
];

export function run(command, args, options = {}) {
  const output = execFileSync(command, args, { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...options });
  return typeof output === 'string' ? output.trim() : '';
}
export function assertPlatform() {
  if (process.platform !== 'darwin') throw new Error('Computer Use requires macOS; protocol tests run on other platforms.');
  if (process.getuid?.() === 0) throw new Error('Run Computer Use as the desktop user, not root.');
}
export function verifySigned(file, { bundle = false } = {}) {
  const canonical = realpathSync(file);
  run('/usr/bin/codesign', ['--verify', ...(bundle ? ['--deep'] : []), '--strict', canonical]);
  const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=2', canonical], { encoding: 'utf8', timeout: 15000 });
  const output = `${details.stdout ?? ''}\n${details.stderr ?? ''}`;
  if (details.status !== 0 || !output.split(/\r?\n/).includes(`TeamIdentifier=${TEAM_ID}`)) {
    throw new Error(`Unexpected signing team: ${path.basename(file)}`);
  }
  return canonical;
}

export function resolveRuntime() {
  assertPlatform();
  const codex = CODEX_CANDIDATES.find(file => existsSync(file));
  if (!codex) throw new Error('ChatGPT.app bundled codex is missing. Install ChatGPT.app; do not sign in.');
  if (!existsSync(RUNTIME_APP)) throw new Error('Computer Use runtime is missing. Run bash scripts/install.sh.');
  const app = verifySigned(RUNTIME_APP, { bundle: true });
  const client = verifySigned(path.join(app, CLIENT_REL));
  const service = verifySigned(path.join(app, SERVICE_REL));
  const verifiedCodex = verifySigned(codex);
  let clientBuild = 'unknown';
  try { clientBuild = run('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '-o', '-', path.join(app, 'Contents/Info.plist')]); } catch {}
  return { codex: verifiedCodex, app, client, service, clientBuild, brokerVersion: run(verifiedCodex, ['--version']) };
}

export function status() {
  const result = { version: VERSION, standalone: true, npmDependencies: 0, brokerVerified: false, guiVerified: false };
  try { Object.assign(result, resolveRuntime(), { brokerVerified: true }); }
  catch (error) { result.error = error.message; }
  return result;
}

export const DISABLED_CONFIG = `model_provider = "direct_disabled"
model = "direct-disabled"
cli_auth_credentials_store = "file"
web_search = "disabled"
plugins = {}
mcp_servers = {}
[history]
persistence = "none"
[analytics]
enabled = false
[otel]
exporter = "none"
[features]
shell_tool = false
unified_exec = false
multi_agent = false
memories = false
remote_plugin = false
plugins = false
remote_control = false
hooks = false
[memories]
use_memories = false
generate_memories = false
[model_providers.direct_disabled]
name = "Local direct dispatch only"
base_url = "http://127.0.0.1:9/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
requires_openai_auth = false
`;

export async function createIsolation(runtime, { tempDir = os.tmpdir(), parentEnv = process.env } = {}) {
  const root = await mkdtemp(path.join(tempDir, 'cu-remote-'));
  try {
    await chmod(root, 0o700);
    const home = path.join(root, 'codex-home');
    const sqlite = path.join(home, 'sqlite');
    const work = path.join(root, 'work');
    for (const directory of [home, sqlite, work, path.join(home, 'computer-use')]) await mkdir(directory, { mode: 0o700 });
    await writeFile(path.join(home, 'config.toml'), DISABLED_CONFIG, { mode: 0o600 });
    await symlink(runtime.app, path.join(home, 'computer-use/Codex Computer Use.app'), 'dir');
    const env = {
      HOME: root, CODEX_HOME: home, CODEX_SQLITE_HOME: sqlite,
      PATH: `${path.dirname(runtime.codex)}:/usr/bin:/bin:/usr/sbin:/sbin`,
      TMPDIR: root, NO_COLOR: '1', CLICOLOR: '0'
    };
    for (const key of ['USER', 'LOGNAME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SHELL', 'TERM']) {
      if (parentEnv[key]) env[key] = parentEnv[key];
    }
    const mcpEnv = ['HOME', 'CODEX_HOME', 'CODEX_SQLITE_HOME', 'PATH', 'TMPDIR']
      .map(key => `${key} = ${JSON.stringify(env[key])}`).join(', ');
    const table = `{"computer-use" = { command = ${JSON.stringify(runtime.client)}, args = ["mcp"], cwd = ${JSON.stringify(work)}, env = { ${mcpEnv} }, enabled = true, startup_timeout_sec = 30, tool_timeout_sec = 120 }}`;
    return { root, home, sqlite, work, env, args: ['-c', `mcp_servers=${table}`, 'app-server', '--stdio'] };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}
