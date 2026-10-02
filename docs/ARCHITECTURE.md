# Architecture

The goal is to keep the reasoning model on the remote MCP client while using
OpenAI's signed macOS Computer Use components only as an execution backend.

```text
Remote Codex client (for example Debian Codex)
        |
        | MCP over SSH stdio
        v
root-owned Aqua launcher (macOS, optional for SSH)
        |
        | launchctl asuser <uid>
        | sudo -u <desktop-user>
        v
patched codex-computer-use-mcp
        |
        | signed Codex app-server, zero-turn direct dispatch
        v
SkyComputerUseClient
        |
        v
SkyComputerUseService
        |
        +-- Accessibility tree
        +-- Screenshot
        +-- click / type / scroll / drag / key events
```

## Compatibility changes

The patch adds four pieces required by the tested ChatGPT/CUA build:

1. `CODEX_SQLITE_HOME` is created and propagated beside `CODEX_HOME`.
2. The isolated `CODEX_HOME` gets a runtime mapping at
   `computer-use/Codex Computer Use.app` pointing to the verified official
   per-user runtime.
3. The isolated config contains the same unreachable, `requires_openai_auth = false`
   provider so the nested auth-status app-server can initialize without account
   credentials.
4. `/Applications/ChatGPT.app/Contents/Resources` is added to `PATH` because
   `SkyComputerUseService` launches `env codex app-server --listen stdio://`.

The upstream broker still rejects observed model-turn activity. The dummy model
provider remains bound to unreachable loopback (`127.0.0.1:9`).

## Why the Aqua launcher exists

A direct SSH session lives in a background/user launchd context. On the tested
machine, local Computer Use worked while an SSH-spawned broker could return
`procNotFound (-600)` for Finder. The optional root-owned launcher enters the
logged-in user's GUI bootstrap/audit session using `launchctl asuser`, then
immediately drops back to the desktop user before starting the user-writable MCP
wrapper.
