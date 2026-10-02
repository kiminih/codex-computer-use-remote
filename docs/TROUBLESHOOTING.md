# Troubleshooting

Run `bash scripts/doctor.sh`, then `bash scripts/smoke-local.sh`. Record the
actual error and versions before changing configuration. Never infer success
from process liveness or a signature/status check alone.

## Missing runtime or signature failure

Install official ChatGPT.app under `/Applications`, then rerun the installer.
Supported Codex layouts include `Contents/Resources/codex` and the nested
`codex-cli/CodexCLI.app/Contents/MacOS/codex` layout. Runtime extraction supports
the bundled `cua_node/.../@oai/sky` and legacy computer-use plugin locations.
Unsupported layouts fail explicitly; no arbitrary executable is substituted.
Do not re-sign components, disable signature checks or remove quarantine to
silence a failure. Existing per-user runtimes are not overwritten automatically.
If an application update causes a mismatch, preserve the old runtime before
removing it and rerunning installation.

## -10005: app-server exited

This is an error summary, not proof that an account must be signed in. Check
that the official Codex executable is found in the native service PATH, both
isolated home variables are present, and the runtime mapping exists. The
standalone implementation includes these compatibility settings directly.
Capture a fresh error after an update rather than applying old text patches.

## -600 through SSH only

Compare a local smoke test with the actual remote call. An SSH session can have
different GUI/audit-session access. Install the optional launcher using
`bash scripts/install.sh --with-ssh-gui`, and use the matching SSH configuration.
The intended user must own the active desktop. A password prompt under
`sudo -n` indicates the fixed launcher rule is not installed or does not match.
Do not grant unrestricted NOPASSWD access to launchctl or a user-writable script.

## macOS permissions or runtime consent

Enable the installed **Codex Computer Use.app** in Accessibility and Screen &
System Audio Recording. Automation (AppleEvents) is a separate permission.
`bash scripts/tcc-diagnose.sh 5` prints matching recent TCC records. Review them
locally before sharing; they can contain process paths and application names.
This repository never edits TCC.db. Unsupported MCP consent requests are
cancelled, not automatically approved. A client without the needed consent
capability cannot complete such a request.

## Session already in use

Close the other local/remote MCP connection and retry. The lock is under
`~/.local/state/codex-computer-use-remote/session.lock/owner.json`. A hard crash
can leave a stale lock. Inspect the recorded PID and your process list; only
remove that lock directory after confirming its owner no longer exists and
no Computer Use session is running. There is no force-unlock command that might
interrupt somebody else's session. Restarting a client may leave an idle native
session for up to 120 seconds if the transport has not actually disconnected.

## State required before an action

Call get_app_state again, using the exact app argument you will use for the
next action. Element identifiers are session-local. They are discarded after
an error, cancellation, idle expiry or disconnect. Do not retry a click against
an old identifier after reconnecting.

## Upgrade or uninstall

`bash scripts/rollback.sh` restores the saved user-level wrapper. The GUI launcher
and official runtime remain intact. Installation backups and v0.1's managed
upstream checkout are intentionally retained, but v0.2 no longer loads upstream
code or node_modules. Uninstall removes only recognized launchers. Account
state, official apps, private captures and unrelated processes are not removed.
