# Architecture

```text
Remote MCP client
  → SSH stdio
  → optional root-owned GUI launcher
  → desktop-user standalone Node server
  → OpenAI-signed Codex app-server
  → direct mcpServer/tool/call
  → official Computer Use client/service
  → macOS GUI
```

There is no upstream checkout, patch application, package installation, compiler,
or model invocation in the installation/runtime path. The operating system,
Node.js and the locally installed proprietary runtime remain dependencies.

## Modules

- `rpc.mjs`: bounded UTF-8 JSONL framing, request IDs, timers and cancellation.
- `mcp-stdio.mjs`: negotiated MCP lifecycle, tool dispatch, consent forwarding.
- `tools.mjs`: fixed native method schemas and argument checks.
- `computer-use.mjs`: signed runtime bootstrap, direct RPC, serialized sessions,
  per-app state prerequisites, idle expiry and model-turn detection.
- `runtime.mjs`: component discovery, signature checks and isolated configuration.
- `processes.mjs`: per-user session lock and scoped process ownership/teardown.
- `install.mjs`: offline staging, wrappers, GUI launcher, rollback and uninstall.

## Native protocol

Open the signed app-server with a private home and only the Computer Use MCP
entry. Send `initialize`, then `initialized`, then `thread/start` with an
ephemeral thread. Send only `mcpServer/tool/call` for native operations.
Never send `turn/start`. Reject unexpected `turn/*` or `item/*` messages.
These are internal app-server interfaces and may change independently of MCP.

A newly written `config.toml` persists an unreachable model provider and disables
other tools, plugins, history and analytics. Credentials use the private file
store, not a shared keychain selection. The Computer Use runtime is linked into
that private home's expected path. The official Codex directory is included in
PATH for the service's nested `env codex app-server` launch.

The implementation does not disable TCC, patch signed binaries, remove
quarantine, fake a signing identity, or auto-accept runtime consent.

## Session and cleanup scope

One native session owns the desktop user lock. Requests on a connection are
serialized. Successful state reads establish the exact app target used by later
actions. Errors, cancellation, idle expiry, EOF and termination close the session.
Tracked descendants and a native service explicitly associated with the private
CODEX_HOME are terminated after PID identity checks. The implementation does not
kill unrelated Codex processes or globally set launchd environment variables.

A successful cleanup means the tracked owned processes terminated and the private
home/lock were removed. It is not a claim that every macOS or proprietary helper
has been inventoried. A cleanup failure retains the directory and is reported.

## Protocol scope

MCP stdio profiles: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05. An unknown
requested version is negotiated down to the newest implemented profile. No HTTP,
sampling, tasks, generic execution or future-draft compatibility is advertised.
Input/output frames are bounded to 32 MiB; tool arguments are bounded to 1 MiB;
there are at most 32 in-flight client requests and 128 pending native RPC requests.
EOF does not count as a successful response. Cancelled requests get no late reply.

## Sources and provenance

- MCP specification: https://modelcontextprotocol.io/specification/2025-11-25
- Codex app-server: https://github.com/openai/codex/tree/main/codex-rs/app-server
- Initial upstream bridge: https://github.com/tmustier/codex-computer-use-mcp

The upstream MIT notice is retained in NOTICE.md; no upstream package is fetched.
