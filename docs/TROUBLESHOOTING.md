# Troubleshooting

Start with the local checks and keep the error message and component versions:

```bash
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

A successful read needs app text and a screenshot. A running process or successful signature check alone does not confirm GUI access.

## Missing components or invalid signature

Install official ChatGPT.app in `/Applications`, then rerun the installer. It supports the bundled Codex and Computer Use layouts listed in the runtime code. Unrecognized layouts stop installation.

Existing components are verified, not replaced automatically. If an update causes a mismatch, back up the old per-user runtime before removing it and reinstalling. Use official components; keep signature checks enabled.

## `-10005`: app-server exited

Check the Codex executable in the service's `PATH`, the private `CODEX_HOME` and `CODEX_SQLITE_HOME`, and the runtime link. These are set by the bridge. After a ChatGPT.app update, record the new versions and error for a compatibility report.

This error alone does not establish that sign-in is required.

## `-600` only over SSH

Test locally first. If that works, install the desktop-session launcher on the Mac:

```bash
bash scripts/install.sh --with-ssh-gui
```

Use the [remote configuration](../examples/codex-config.toml) and confirm the SSH account is the active desktop user. A password error from `sudo -n` means the launcher rule is missing or does not match. Keep sudo access limited to the fixed launcher.

## Permission or approval errors

Enable **Codex Computer Use** under Accessibility and Screen & System Audio Recording. Automation (AppleEvents) is a separate permission.

To inspect recent permission records:

```bash
bash scripts/tcc-diagnose.sh 5
```

Review paths and app names before sharing logs. The project does not edit the TCC database. If a client cannot handle a required approval request, the request is cancelled; use a client that supports it.

## Session already in use

Close the other MCP connection and retry. Lock details are stored in:

```text
~/.local/state/codex-computer-use-remote/session.lock/owner.json
```

After a crash, remove a stale lock only after confirming that its owner has exited and no Computer Use session is running. A connection that remains open may hold an idle session for up to 120 seconds.

## State required before an action

Call `get_app_state` with the exact `app` argument for the next action. Element identifiers expire after an error, cancellation, disconnect or idle timeout. Read the new state before retrying an action.

## Upgrade and uninstall

Update the project and rerun the installer. To restore the previous startup script:

```bash
bash scripts/rollback.sh
```

To remove the project's launchers:

```bash
bash scripts/uninstall.sh
```

Version directories, backups, official components and account data remain. Old v0.1 installations are retained for rollback.

To also remove a runtime created by this installer:

```bash
bash scripts/uninstall.sh --remove-runtime
```

A runtime that existed before installation is preserved. ChatGPT.app is not removed.
