# Codex Computer Use Remote for macOS

Use OpenAI's **official signed macOS Computer Use runtime** as a remote MCP
execution backend, without signing into ChatGPT.app on the Mac and without
running a second model process on the Mac.

This repository is a small compatibility/installer layer around
[`tmustier/codex-computer-use-mcp`](https://github.com/tmustier/codex-computer-use-mcp).
It does not ship OpenAI binaries. It copies the Computer Use runtime from the
user's own installed ChatGPT.app, patches the MIT-licensed upstream bridge for
the tested runtime contract, and optionally installs a narrow SSH→Aqua launcher.

> **Independent project.** Not produced, endorsed, or supported by OpenAI.
> It relies on experimental/internal component behavior and can break after a
> ChatGPT/Codex update.

[中文说明](README.zh-CN.md)

## What this enables

```text
Remote Codex client
      |
      | MCP over SSH
      v
macOS Computer Use executor
      |
      +-- OpenAI-signed Codex app-server
      +-- OpenAI-signed SkyComputerUseClient
      +-- OpenAI-signed SkyComputerUseService
      |
      v
Finder / Xcode / Safari / your macOS app
```

The remote Codex client remains the only reasoning model. On the tested local path,
`get_app_state(Finder)` returned both the accessibility tree and a JPEG screenshot
with `modelTurnsStarted: 0`.

## Requirements

- macOS with an unlocked, logged-in desktop session
- official `/Applications/ChatGPT.app`
- Node.js 22+
- Git, npm, Python 3
- macOS Accessibility and Screen Recording permission for Codex Computer Use
- for remote SSH use: SSH access to the Mac

**No ChatGPT account sign-in is required on the Mac.** ChatGPT.app does not need to be signed in, and the tested local run also had the bundled Mac Codex CLI logged out.

## Install on the Mac

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git codex-computer-use-remote
cd codex-computer-use-remote
bash scripts/install.sh
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

The installer:

1. finds the official Computer Use runtime inside the installed ChatGPT.app;
2. copies it locally to `~/.codex/computer-use/` if needed;
3. verifies the OpenAI Team ID (`2DC432GLL2`);
4. clones `tmustier/codex-computer-use-mcp`;
5. applies the zero-auth/remote compatibility patch;
6. runs `npm ci && npm run build`;
7. installs `~/.local/bin/mac-computer-use-mcp`.

It does **not** modify or re-sign ChatGPT.app or any OpenAI binary.

## What the patch changes

The upstream bridge already provides the important security property: direct
Computer Use dispatch with no nested model turn. This project adds compatibility
for the tested newer CUA runtime:

- propagate `CODEX_SQLITE_HOME` together with the isolated `CODEX_HOME`;
- map the verified runtime into the isolated `CODEX_HOME/computer-use/`;
- persist the unreachable `requires_openai_auth = false` model provider in the
  isolated `config.toml`, so the service's own auth-status app-server sees it;
- add the ChatGPT-bundled Codex directory to `PATH`, because the native service
  launches `env codex app-server --listen stdio://`.

The dummy provider still points at `127.0.0.1:9`, and upstream still fails closed
if model-turn activity is observed.

See [Architecture](docs/ARCHITECTURE.md).

## Local smoke test

```bash
bash scripts/smoke-local.sh
```

Expected shape:

```json
{
  "isError": false,
  "modelTurnsStarted": 0,
  "brokerCleanupVerified": true,
  "content": [
    {"type": "text", "text": "Computer Use state ..."},
    {"type": "image", "mimeType": "image/jpeg", "data": "<omitted>"}
  ]
}
```

## Remote SSH / LAN use

A plain SSH session may live outside the desktop Aqua/audit session. On the
tested host, local Finder inspection succeeded while direct SSH could return
`-600 procNotFound`.

Install the optional root-owned GUI-session launcher:

```bash
bash scripts/install.sh --with-ssh-gui
```

This creates:

- `/usr/local/sbin/codex-computer-use-gui` (root-owned, mode 0755)
- `/etc/sudoers.d/codex-computer-use-gui` (root-owned, mode 0440)

The sudoers rule permits only that fixed launcher. The launcher enters the
logged-in user's GUI session and then drops privileges back to that user before
starting the user-writable MCP wrapper.

Test from the remote machine:

```bash
timeout 5 ssh -T mac-host 'sudo -n /usr/local/sbin/codex-computer-use-gui'
echo $?
```

`124` means the stdio MCP server stayed alive until `timeout` killed it.

### Codex MCP example on the remote machine

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

See [`examples/`](examples/) for SSH and Codex config snippets.

## Privacy and token behavior

This project does not extract or distribute ChatGPT/Codex credentials. The
patched bridge uses an isolated `CODEX_HOME` with an unreachable dummy model
provider and rejects observed model-turn activity. The tested local Finder call
reported `modelTurnsStarted: 0`.

Computer Use itself still returns app text and screenshots to the invoking MCP
client; that is the capability's purpose. Treat the remote MCP client as a
trusted controller.

## macOS permissions

macOS TCC remains authoritative. You may need to enable **Codex Computer Use**
in:

- Privacy & Security → Accessibility
- Privacy & Security → Screen & System Audio Recording

SSH can also expose an AppleEvents attribution issue involving
`/usr/libexec/sshd-keygen-wrapper`. Run:

```bash
bash scripts/tcc-diagnose.sh
```

This repository intentionally does not rewrite TCC.db automatically. See
[Troubleshooting](docs/TROUBLESHOOTING.md).

## Tested status

See [docs/TESTED.md](docs/TESTED.md). Local zero-auth/zero-turn Finder inspection
is confirmed. The SSH/Aqua launcher start path is confirmed; the final remote
Finder read should be re-validated before calling the remote path production-ready.

## Updating

The installer resets its managed upstream checkout to current `main` and applies
strict source-pattern checks. If upstream changes incompatibly, the patcher exits
instead of silently producing an unknown build.

Because this integration depends on private/experimental behavior, pin a known
working upstream revision before publishing a stable release.

## Uninstall

```bash
bash scripts/uninstall.sh
```

To also remove the per-user copied runtime:

```bash
bash scripts/uninstall.sh --remove-runtime
```

ChatGPT.app is never removed or modified.

## Upstream and license

- Upstream bridge: https://github.com/tmustier/codex-computer-use-mcp — MIT
- Upstream copyright: Copyright (c) 2026 Thomas Mustier
- This compatibility/installer layer: MIT; see [LICENSE](LICENSE)
- Additional notices: [NOTICE.md](NOTICE.md)
