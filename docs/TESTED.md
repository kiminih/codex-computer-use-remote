# Tested matrix

The compatibility work in this repository was developed against this stack:

- macOS 26.5.1, Apple Silicon
- ChatGPT.app 26.903.61454 (build 8378)
- bundled Codex CLI 0.153.4
- Codex Computer Use app/client build 1000968
- Node.js 25.8.2 during debugging (project requires Node.js 22+)
- upstream `tmustier/codex-computer-use-mcp` 0.5.0-era source

Confirmed locally on macOS:

- ChatGPT GUI not signed in
- bundled Codex CLI not signed in
- `get_app_state({app: "Finder"})` succeeds
- accessibility tree returned
- JPEG screenshot returned
- `modelTurnsStarted == 0`

Confirmed for remote startup:

- SSH stdio MCP process stays alive
- root-owned `launchctl asuser` launcher stays alive from SSH without a password

At the time this bundle was prepared, the final remote Finder read through the
Aqua launcher had not yet been re-run after the launcher change. Treat that last
hop as **pending end-to-end validation** rather than a proven claim.
