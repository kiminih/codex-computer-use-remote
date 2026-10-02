# Codex Computer Use Remote

Read and control Mac apps from Codex or another MCP client. Take screenshots, click, type and scroll, locally or over SSH from another computer.

Uses the Computer Use components in your installed ChatGPT.app. **No ChatGPT account sign-in is required on the Mac.**

[中文说明](README.zh-CN.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Architecture](docs/ARCHITECTURE.md)

> v0.2 is experimental. Automated tests pass; live desktop and SSH operation are pending validation. See [test status](docs/TESTED.md).

## Requirements

- A Mac with the desktop user logged in and the screen unlocked.
- Official ChatGPT.app installed in `/Applications` and retained on the Mac.
- Node.js 22 or newer. Remote use also requires SSH access to the Mac.

## Install on the Mac

```bash
git clone https://github.com/kiminih/codex-computer-use-remote.git
cd codex-computer-use-remote
bash scripts/install.sh
```

The installer extracts and verifies the required components. In System Settings → Privacy & Security, allow **Codex Computer Use** under Accessibility and Screen & System Audio Recording. Then check the installation and test reading Finder:

```bash
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

A successful read returns Finder text and a screenshot.

The installed MCP command is `~/.local/bin/mac-computer-use-mcp`. Your client starts it automatically; no separate terminal needs to stay open.

## Connect from another computer

On the Mac, install the remote launcher:

```bash
bash scripts/install.sh --with-ssh-gui
```

This step needs sudo access to enter the desktop session. The MCP process still runs as the desktop user, not root.

On the controller, configure an SSH alias using the [example](examples/ssh-config). Replace `mac-host` below with that alias and add this to `~/.codex/config.toml`:

```toml
[mcp_servers.mac-computer-use]
command = "ssh"
args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-T", "mac-host", "sudo", "-n", "/usr/local/sbin/codex-computer-use-gui"]
startup_timeout_sec = 30
tool_timeout_sec = 180
```

Restart the client to use the new configuration. To test the connection from the project directory on the controller:

```bash
node scripts/smoke-remote.mjs mac-host
```

## Use

Call `get_app_state` first, then use the same `app` argument for actions.

| Purpose | Tools |
| --- | --- |
| Read apps and windows | `list_apps`, `get_app_state` |
| Mouse and keyboard | `click`, `drag`, `scroll`, `press_key` |
| Text and controls | `type_text`, `set_value`, `select_text`, `perform_secondary_action` |
| Check service status | `computer_use_status` |

One session can control each Mac user at a time. Read the app again after an error, cancellation, disconnect or two minutes idle. Reading state may activate the app.

## Permissions and privacy

App text and screenshots are sent to the controller. Connect only trusted clients. macOS permissions and component approvals still apply; unsupported approval requests are cancelled.

The Mac bridge does not request model inference. Model usage on the controller is handled by its chosen service. See [Security](SECURITY.md).

## Update, roll back or uninstall

Update the project and rerun the install command. The installer backs up the existing startup script.

Restore the previous startup script:

```bash
bash scripts/rollback.sh
```

Remove the launchers:

```bash
bash scripts/uninstall.sh
```

Official components, version backups and account data are retained by default. See [full uninstall details](docs/TROUBLESHOOTING.md#upgrade-and-uninstall).

## License

[MIT](LICENSE). See [NOTICE](NOTICE.md) for attribution. This is an independent project, not supported by OpenAI. ChatGPT.app updates may require compatibility changes.
