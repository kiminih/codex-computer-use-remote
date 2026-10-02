# Architecture

The MCP client decides what to do. The Mac bridge passes tool calls to the signed Computer Use runtime and returns app text and screenshots.

```text
MCP client
  → SSH (remote use)
  → GUI-session launcher (remote use)
  → Node.js MCP server
  → signed Codex app-server
  → Computer Use client and service
  → macOS apps
```

## Request flow

Start app-server with a private configuration, then send:

```text
initialize → initialized → thread/start (ephemeral) → mcpServer/tool/call
```

The bridge never sends `turn/start`. Observed `turn/*` or `item/*` messages end the session. These native app-server interfaces are internal and may change with ChatGPT.app.

## Runtime isolation

Each session has a private `CODEX_HOME`, `CODEX_SQLITE_HOME` and temporary working directory. The configuration uses a file-based credential store, an unreachable model provider at `127.0.0.1:9`, and disables other tools, plugins, history and analytics.

The verified Computer Use app is linked into the private home. The signed Codex directory is added to `PATH` so the service can launch `env codex app-server`. Only an allowlist of environment variables is inherited.

`modelTurnsStarted` counts events observed on the app-server connection. It is not a system-wide usage meter or network control.

## Sessions and cleanup

A per-user lock allows one native session at a time. Calls are serialized; actions require a prior state read with the same app target. Errors, cancellation, disconnects and 120 seconds idle close the session.

Cleanup checks process identity before stopping owned descendants and services associated with the private home. It then removes the temporary directory and lock. If cleanup fails, it reports the error and retains the directory for diagnosis. Unrelated processes are left alone.

For SSH, a root-owned launcher checks the desktop user, enters the GUI session and drops privileges before starting the MCP process. macOS permissions and runtime approval requests remain in effect.

## MCP support

| Item | Support or limit |
| --- | --- |
| Transport | stdio JSON-RPC |
| Protocol profiles | 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05 |
| Frame size | 32 MiB |
| Tool arguments | 1 MiB |
| In-flight client requests | 32 |
| Pending native requests | 128 |

Unknown protocol versions negotiate to the newest implemented profile. HTTP, sampling, tasks and generic command execution are not exposed. Unsupported approval requests are cancelled. Cancelled requests receive no late reply; EOF is not a successful response.

## Modules

| Module | Responsibility |
| --- | --- |
| `rpc.mjs` | JSONL framing, request IDs, timeouts and cancellation |
| `mcp-stdio.mjs` | MCP lifecycle, tool dispatch and approvals |
| `tools.mjs` | Tool definitions and argument checks |
| `computer-use.mjs` | Native calls, session reuse and model-turn checks |
| `runtime.mjs` | Component discovery, signatures and isolation |
| `processes.mjs` | Session lock and process cleanup |
| `install.mjs` | Installation, launchers, rollback and uninstall |

## References

- [MCP specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [Codex app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server)
- [Code attribution](../NOTICE.md)
