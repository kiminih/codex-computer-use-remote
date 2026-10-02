# Codex Computer Use Remote

**Standalone macOS Computer Use over MCP. No upstream checkout, npm packages, or build step.**

Use the official signed Computer Use components from your own installed
ChatGPT.app. **No ChatGPT account sign-in is required on the Mac for the tested
compatibility path.** The bridge uses an isolated, credential-free configuration
and does not issue model-turn requests. The invoking client remains responsible
for any model usage on its own side.

[中文说明](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Test status](docs/TESTED.md)

> **0.2.0 experimental.** The standalone rewrite has automated protocol/process
> tests, but has not yet been validated against a live macOS GUI. The earlier
> compatibility implementation read Finder and returned a screenshot with the
> Mac CLI logged out. That historical result is not a hardware regression test
> of this rewrite. See the exact boundaries in [TESTED.md](docs/TESTED.md).
>
> Independent project, not produced, endorsed or supported by OpenAI. Internal
> runtime interfaces can change after a ChatGPT.app update.

## Requirements

- A Mac with the intended desktop user logged in and the screen unlocked.
- Official `/Applications/ChatGPT.app`, retained on disk; no GUI sign-in needed.
- Node.js 22 or newer.
- Accessibility and Screen & System Audio Recording permission for **Codex Computer Use**.
- SSH access for remote operation. Git is only one way to obtain this repository; downloading a source archive also works.

No Python, TypeScript, MCP SDK, Zod, `npm install`, upstream clone or compilation
is required. Installation does not download anything. macOS permissions and
any official runtime consent remain in force.

## Install locally

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git
cd codex-computer-use-remote
bash scripts/install.sh
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

The installer verifies the signing team of bundled Codex and the runtime. When
needed, it copies the runtime from the **installed application bundle**, not a
DMG, to `~/.codex/computer-use/Codex Computer Use.app`. Existing runtimes are
verified, not silently replaced. Official files are never patched or re-signed.

The standalone bridge is installed under
`~/.local/share/codex-computer-use-remote/current/`. A wrapper is placed at:

```text
~/.local/bin/mac-computer-use-mcp
```

That command is a stdio MCP server: it waits for protocol input, not terminal
commands. Do not keep a second manually started copy running. The MCP client
starts its own copy automatically. `--version`, `--status`, and `--smoke` are
also available. A successful status check alone does not prove GUI access.

## Remote SSH / LAN

On the Mac, install the optional GUI-session launcher:

```bash
bash scripts/install.sh --with-ssh-gui
```

It installs a root-owned fixed command at
`/usr/local/sbin/codex-computer-use-gui` and a mode-0440 sudoers entry allowing
**only that command with no arguments**. It checks the active desktop user,
enters the GUI session, and drops back to that user before executing the MCP
wrapper. It does not run the bridge as root. Unsafe privileged parent directory
ownership causes installation to stop rather than broadening permissions.

On the remote machine, set up the SSH alias in [examples/ssh-config](examples/ssh-config),
then configure Codex:

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

Restart the client after changing its MCP configuration. For an end-to-end
read test without invoking a model, run from this repository on the remote host:

```bash
node scripts/smoke-remote.mjs mac-host
```

This requests Finder state over SSH and checks for an image response. Reading
state may activate an application; it does not explicitly click, type or scroll.
A `timeout` exit code of 124 only means a process stayed alive, **not** that MCP
or GUI control works.

## Tools

`list_apps`, `get_app_state`, `click`, `perform_secondary_action`, `set_value`,
`select_text`, `scroll`, `drag`, `press_key`, `type_text`, and `computer_use_status`.

Read `get_app_state` first and reuse the exact app target for subsequent actions.
The connection keeps a serialized native session so element identifiers remain
usable. After 120 seconds idle, an error, cancellation or disconnect, the session
is closed and the app must be read again. One native session per OS user is
allowed at a time to avoid conflicting GUI control.

Runtime approval requests are forwarded to clients supporting the implemented
MCP elicitation profile. Unsupported or unanswered requests are cancelled,
**never silently approved**. The server supports the negotiated MCP stdio
2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05 profiles. It does not claim full
support for newer drafts, HTTP, sampling, tasks or arbitrary shell execution.

## Isolation and usage

Each native session gets a private temporary `CODEX_HOME`, `CODEX_SQLITE_HOME`,
configuration and runtime mapping. Only a small environment allowlist is passed
through; account files, API keys, shell startup files and `NODE_OPTIONS` are not
inherited. The signed Codex directory is included in `PATH` so the native
service can resolve its own `env codex app-server` invocation.

The configured model provider points to `127.0.0.1:9`; the bridge never sends
`turn/start` and terminates a session if `turn/*` or `item/*` activity is observed.
This is a no-inference design, **not a network firewall or system-wide billing
meter**. The `modelTurnsStarted` field reports observations on this connection,
not an audit of all proprietary subprocesses. No screenshot/text audit log is
written by this bridge. Tool results still go to the trusted invoking client.

Process cleanup targets session-owned descendants and native services associated
with that private home, not every Codex or Computer Use process on the machine.
Cleanup failures are reported and retain the private directory for diagnosis.

## Upgrade, rollback and uninstall

Re-run the installer from a new source checkout. It stages a new release and
backs up the existing wrapper before switching. The old v0.1 upstream checkout
is left untouched for rollback but is no longer used by v0.2.

```bash
bash scripts/rollback.sh
bash scripts/uninstall.sh
```

Uninstall removes recognized launchers, not releases, backups, ChatGPT.app or
account data. `bash scripts/uninstall.sh --remove-runtime` additionally removes
the copied runtime only when installation recorded that it created it. A runtime
that predated installation is deliberately left alone.

## Tests

```bash
node scripts/check.mjs
node --test test/*.test.mjs
```

The tests use Node's standard library and local subprocess fixtures. They need
no API key and make no model calls. They cover framing, lifecycle, schemas,
cancellation, session reuse, consent forwarding, model-turn guards, process
cleanup and full MCP-to-child-RPC integration. They do not substitute for the
macOS TCC/LaunchServices/GUI smoke tests. See [Troubleshooting](docs/TROUBLESHOOTING.md).

## License and provenance

MIT for this repository. Earlier protocol and isolation work was informed by
Thomas Mustier's MIT project; its notice remains in [NOTICE.md](NOTICE.md).
This is attribution, not an installation or runtime dependency. No proprietary
OpenAI binaries, credentials, TCC databases, SSH keys or private captures are
included. Their respective licenses still apply.
