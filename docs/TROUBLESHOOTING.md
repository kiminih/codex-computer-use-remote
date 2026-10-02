# Troubleshooting

## `-10005: codex app-server exited before returning a response`

Check these in order:

1. `scripts/doctor.sh`
2. Confirm the per-user runtime exists at:
   `~/.codex/computer-use/Codex Computer Use.app`
3. Confirm the patched checkout was rebuilt after applying the patch.
4. Confirm the ChatGPT-bundled Codex directory is on the broker environment PATH.
5. Confirm the nested service receives `CODEX_HOME` and `CODEX_SQLITE_HOME`.

The compatibility patch addresses all five for the tested build.

## `-600 procNotFound`

If local Finder inspection succeeds but an SSH-launched broker returns `-600`,
use the optional GUI/Aqua launcher:

```bash
./scripts/install.sh --with-ssh-gui
```

Then use `sudo -n /usr/local/sbin/codex-computer-use-gui` as the SSH remote
command in your MCP configuration.

## AppleEvents denied for `sshd-keygen-wrapper`

Inspect TCC logs:

```bash
./scripts/tcc-diagnose.sh
```

A known SSH failure mode looks like:

```text
responsible_path=/usr/libexec/sshd-keygen-wrapper
access to kTCCServiceAppleEvents denied
```

This repository deliberately does not edit the TCC database automatically.
If your host shows this exact denial, use a reviewed/manual TCC repair approach
and keep a backup. The `macuse` project documents one such SSH repair workflow:
https://github.com/fitchmultz/macuse

## Accessibility / screen capture

macOS privacy controls still apply. Add/enable **Codex Computer Use** in:

- System Settings → Privacy & Security → Accessibility
- System Settings → Privacy & Security → Screen & System Audio Recording

## Locked screen

Assume an unlocked, logged-in desktop session. This project does not attempt to
bypass the macOS lock screen.
