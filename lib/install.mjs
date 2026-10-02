import { cp, mkdir, readFile, writeFile, rename, rm, symlink, readlink, lstat, chmod } from 'node:fs/promises';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACCOUNT_HOME, RUNTIME_APP, CLIENT_REL, SERVICE_REL, CODEX_CANDIDATES, CHATGPT_APP, VERSION, assertPlatform, verifySigned, resolveRuntime, run } from './runtime.mjs';

export const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const INSTALL_BASE = path.join(ACCOUNT_HOME, '.local/share/codex-computer-use-remote');
export const WRAPPER = path.join(ACCOUNT_HOME, '.local/bin/mac-computer-use-mcp');
export const ROOT_WRAPPER = '/usr/local/sbin/codex-computer-use-gui';
export const SUDOERS = '/private/etc/sudoers.d/codex-computer-use-gui';
export const MARKER = '# codex-computer-use-remote managed launcher';
export const quote = text => "'" + String(text).replaceAll("'", "'\\''") + "'";
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);

export function makeLauncher({ username, uid, home, wrapper = WRAPPER }) {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(username) || !Number.isSafeInteger(uid) || uid < 1) throw new Error('Unsupported desktop user identity');
  if (![home, wrapper].every(value => path.isAbsolute(value) && !/[\r\n\0]/.test(value))) throw new Error('Invalid launcher path');
  return `#!/bin/sh\n${MARKER}\nset -eu\n[ "$#" -eq 0 ] || { echo "No arguments allowed" >&2; exit 2; }\n[ "$(/usr/bin/id -u)" -eq 0 ] || exit 1\n[ "$(/usr/bin/stat -f %u /dev/console)" -eq ${uid} ] || { echo "Target user must own the active desktop" >&2; exit 1; }\n/bin/launchctl print gui/${uid} >/dev/null\nexec /bin/launchctl asuser ${uid} /usr/bin/sudo -n -u ${quote(username)} -H /usr/bin/env -i HOME=${quote(home)} USER=${quote(username)} LOGNAME=${quote(username)} PATH=/usr/bin:/bin:/usr/sbin:/sbin ${quote(wrapper)}\n`;
}
export function rootParentsSafe(file) {
  let dir = path.dirname(file);
  while (dir !== '/') {
    if (existsSync(dir)) {
      const s = lstatSync(dir);
      if (s.isSymbolicLink() || !s.isDirectory() || s.uid !== 0 || (s.mode & 0o022)) throw new Error(`Privileged path is not root-controlled: ${dir}`);
    }
    dir = path.dirname(dir);
  }
}
async function copyForBackup(file) {
  if (!existsSync(file)) return null;
  const backup = file + '.backup-' + stamp();
  await cp(file, backup, { dereference: false, errorOnExist: true, force: false });
  return backup;
}
async function setCurrent(base, target) {
  const temp = path.join(base, '.current-' + randomUUID());
  await symlink(target, temp, 'dir');
  await rename(temp, path.join(base, 'current'));
}
async function ensureRuntime() {
  if (existsSync(RUNTIME_APP)) {
    verifySigned(RUNTIME_APP, { bundle: true });
    verifySigned(path.join(RUNTIME_APP, CLIENT_REL)); verifySigned(path.join(RUNTIME_APP, SERVICE_REL));
    return false;
  }
  const resources = path.join(CHATGPT_APP, 'Contents/Resources');
  const source = [
    path.join(resources, 'cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app'),
    path.join(resources, 'plugins/openai-bundled/plugins/computer-use/Codex Computer Use.app')
  ].find(existsSync);
  if (!source) throw new Error('No supported bundled Computer Use layout found. No files changed; see docs/TROUBLESHOOTING.md.');
  verifySigned(source, { bundle: true }); verifySigned(path.join(source, CLIENT_REL)); verifySigned(path.join(source, SERVICE_REL));
  await mkdir(path.dirname(RUNTIME_APP), { recursive: true, mode: 0o700 });
  const stage = RUNTIME_APP + '.staging-' + stamp();
  try {
    run('/usr/bin/ditto', [source, stage], { timeout: 120000 });
    verifySigned(stage, { bundle: true }); verifySigned(path.join(stage, CLIENT_REL)); verifySigned(path.join(stage, SERVICE_REL));
    if (existsSync(RUNTIME_APP)) throw new Error('Runtime appeared during install; refusing replacement');
    await rename(stage, RUNTIME_APP);
  } finally { await rm(stage, { recursive: true, force: true }); }
  return true;
}

async function installGui() {
  const identity = os.userInfo();
  const text = makeLauncher({ username: identity.username, uid: identity.uid, home: ACCOUNT_HOME });
  rootParentsSafe(ROOT_WRAPPER); rootParentsSafe(SUDOERS);
  for (const file of [ROOT_WRAPPER, SUDOERS]) {
    if (existsSync(file)) {
      const s = lstatSync(file);
      if (s.isSymbolicLink() || !s.isFile() || s.uid !== 0 || (s.mode & 0o022)) throw new Error(`Unsafe existing privileged file: ${file}`);
    }
  }
  run('/usr/bin/sudo', ['-v'], { stdio: 'inherit' });
  const temp = path.join(INSTALL_BASE, '.gui-' + stamp());
  await mkdir(temp, { mode: 0o700 });
  const rule = `${MARKER}\n${identity.username} ALL=(root) NOPASSWD: ${ROOT_WRAPPER} ""\n`;
  await writeFile(path.join(temp, 'launcher'), text, { mode: 0o600 });
  await writeFile(path.join(temp, 'sudoers'), rule, { mode: 0o600 });
  const saved = [];
  try {
    run('/usr/bin/sudo', ['/usr/sbin/visudo', '-cf', path.join(temp, 'sudoers')]);
    run('/usr/bin/sudo', ['/bin/mkdir', '-p', path.dirname(ROOT_WRAPPER), path.dirname(SUDOERS)]);
    rootParentsSafe(ROOT_WRAPPER); rootParentsSafe(SUDOERS);
    for (const [src, dst, mode] of [[path.join(temp, 'launcher'), ROOT_WRAPPER, '0755'], [path.join(temp, 'sudoers'), SUDOERS, '0440']]) {
      const backup = existsSync(dst) ? dst + '.backup-' + stamp() : null;
      if (backup) run('/usr/bin/sudo', ['/bin/cp', '-p', dst, backup]);
      saved.push({ dst, backup });
      run('/usr/bin/sudo', ['/usr/bin/install', '-o', 'root', '-g', 'wheel', '-m', mode, src, dst]);
    }
    run('/usr/bin/sudo', ['/usr/sbin/visudo', '-c']);
    console.log(`Installed GUI launcher: ${ROOT_WRAPPER}`);
  } catch (error) {
    for (const { dst, backup } of saved.reverse()) {
      if (backup) run('/usr/bin/sudo', ['/bin/cp', '-p', backup, dst]);
      else run('/usr/bin/sudo', ['/bin/rm', '-f', dst]);
    }
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}

async function install(withGui) {
  assertPlatform();
  const codex = CODEX_CANDIDATES.find(existsSync);
  if (!codex) throw new Error('Install official ChatGPT.app first. Sign-in is not required.');
  verifySigned(codex);
  const runtimeCreated = await ensureRuntime();
  await mkdir(path.join(INSTALL_BASE, 'releases'), { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(WRAPPER), { recursive: true, mode: 0o700 });
  const current = path.join(INSTALL_BASE, 'current');
  if (existsSync(current) && !(await lstat(current)).isSymbolicLink()) throw new Error('Install current path is not a managed symlink; refusing overwrite');
  let previous = null;
  try { previous = await readlink(current); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const release = path.join(INSTALL_BASE, 'releases', VERSION + '-' + stamp());
  const backup = await copyForBackup(WRAPPER);
  await mkdir(release, { mode: 0o700 });
  try {
    for (const item of ['bin', 'lib', 'scripts', 'VERSION', 'package.json', 'LICENSE', 'NOTICE.md']) await cp(path.join(PROJECT_ROOT, item), path.join(release, item), { recursive: true, dereference: false });
    await setCurrent(INSTALL_BASE, path.relative(INSTALL_BASE, release));
    const tempWrapper = WRAPPER + '.tmp-' + randomUUID();
    await writeFile(tempWrapper, `#!/bin/sh\n${MARKER}\nexec ${quote(realpathSync(process.execPath))} ${quote(path.join(current, 'bin/mac-computer-use-mcp.mjs'))} "$@"\n`, { mode: 0o755 });
    await rename(tempWrapper, WRAPPER);
    if (withGui) await installGui();
    const manifest = { version: VERSION, release, previous, wrapperBackup: backup, runtimeCreated, installedAt: new Date().toISOString() };
    await writeFile(path.join(INSTALL_BASE, 'installation.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    console.log(`Installed ${VERSION}: ${WRAPPER}\nNo downloads, npm packages, build step, or account sign-in.\nNext: bash scripts/doctor.sh && bash scripts/smoke-local.sh`);
  } catch (error) {
    if (previous) await setCurrent(INSTALL_BASE, previous); else await rm(current, { force: true });
    if (backup) await cp(backup, WRAPPER); else await rm(WRAPPER, { force: true });
    await rm(release, { recursive: true, force: true });
    throw error;
  }
}
async function rollback() {
  assertPlatform();
  const info = JSON.parse(await readFile(path.join(INSTALL_BASE, 'installation.json'), 'utf8'));
  if (!info.previous && !info.wrapperBackup) throw new Error('No previous installation was saved');
  if (info.previous) await setCurrent(INSTALL_BASE, info.previous);
  if (info.wrapperBackup) await cp(info.wrapperBackup, WRAPPER);
  console.log('Previous user-level wrapper restored. GUI launcher, runtime and backups retained.');
}
async function uninstall(removeRuntime) {
  assertPlatform();
  for (const file of [WRAPPER, ROOT_WRAPPER, SUDOERS]) {
    if (!existsSync(file)) continue;
    if (file !== WRAPPER) run('/usr/bin/sudo', ['-v'], { stdio: 'inherit' });
    const text = file === SUDOERS ? run('/usr/bin/sudo', ['/bin/cat', file]) : await readFile(file, 'utf8');
    if (!text.includes(MARKER)) { console.log(`Left unrecognized file unchanged: ${file}`); continue; }
    if (file === WRAPPER) await rm(file);
    else run('/usr/bin/sudo', ['/bin/rm', '-f', file], { stdio: 'inherit' });
  }
  if (removeRuntime) {
    const info = JSON.parse(await readFile(path.join(INSTALL_BASE, 'installation.json'), 'utf8'));
    if (!info.runtimeCreated) throw new Error('This install did not create the runtime; remove it manually only after checking other users');
    verifySigned(RUNTIME_APP, { bundle: true });
    await rm(RUNTIME_APP, { recursive: true });
  }
  console.log(`Launchers removed. Retained runtime (unless explicitly removed), releases and backups in ${INSTALL_BASE}. ChatGPT.app and account data were not changed.`);
}
async function doctor() {
  const report = { version: VERSION, checks: [], warnings: [] };
  try { report.runtime = resolveRuntime(); report.checks.push('Official runtime and signing team verified'); }
  catch (error) { report.error = error.message; }
  if (process.platform === 'darwin') {
    try { run('/bin/launchctl', ['print', `gui/${os.userInfo().uid}`]); report.checks.push('GUI domain exists'); } catch { report.warnings.push('GUI domain missing'); }
    report.warnings.push('Signatures and a GUI domain do not prove Accessibility, screen capture, or SSH operation. Run the smoke test.');
  }
  console.log(JSON.stringify(report, null, 2)); if (report.error) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'install', ...args] = process.argv.slice(2);
  try {
    if (command === 'install' && (args.length === 0 || (args.length === 1 && args[0] === '--with-ssh-gui'))) await install(args.length === 1);
    else if (command === 'uninstall' && (args.length === 0 || (args.length === 1 && args[0] === '--remove-runtime'))) await uninstall(args.length === 1);
    else if (command === 'rollback' && !args.length) await rollback();
    else if (command === 'doctor' && !args.length) await doctor();
    else throw new Error('Usage: install [--with-ssh-gui] | doctor | rollback | uninstall [--remove-runtime]');
  } catch (error) { console.error(`ERROR: ${error.message}`); process.exitCode = 1; }
}
