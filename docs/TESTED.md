# Test status

## Standalone 0.2.0

Recorded for this source revision on 2026-10-01:

| Check | Result | Scope |
| --- | --- | --- |
| `node scripts/check.mjs` | Passed | JavaScript/shell syntax and empty npm dependency sets |
| `node --test test/*.test.mjs` | 80 passed, 0 failed | Linux, Node.js 22.16.0; standard-library tests and local subprocess fixtures |
| Fresh install on a physical Mac | Not run | Requires user-owned ChatGPT.app and macOS permissions |
| Signed runtime Finder screenshot on 0.2.0 | Not run | Do not substitute the historical result below |
| SSH → Aqua → Finder on 0.2.0 | Not run | Requires the target Mac and remote client |

The suite covers schemas, bounded and fragmented JSONL, protocol negotiation,
initialization, request correlation, cancellation, consent responses, screenshot
block forwarding, runtime mapping, environment isolation, session reuse, idle
expiry, model-turn guards, subprocess failures, detached-descendant cleanup,
no-argument launcher construction, and full MCP-to-child-RPC behavior. EOF,
SIGINT and SIGTERM teardown are exercised with real fixture subprocesses.

Fixtures do not simulate the complete proprietary runtime, signatures, TCC,
LaunchServices, Aqua sessions, workspace entitlements or app-specific behavior.
GitHub Actions is configured to run the same suite on Linux and macOS; the
workflow result is separate evidence and is not predeclared successful here.

## Historical compatibility implementation (before the rewrite)

The earlier implementation was tested on macOS 26.5.1, Apple Silicon, ChatGPT.app
26.903.61454 build 8378, Codex CLI 0.153.4 and Computer Use build 1000968.
With the Mac CLI logged out, Finder returned an accessibility tree and JPEG
image with `modelTurnsStarted: 0`. The SSH/Aqua launcher stayed alive, but a final
remote Finder read had not been recorded after the launcher adjustment.

Those results motivated the standalone implementation. They do not establish
that this rewritten 0.2.0 source has passed a physical-Mac regression test.

## Hardware acceptance

On the Mac, record `bash scripts/doctor.sh` and `bash scripts/smoke-local.sh`.
On the controller, record `node scripts/smoke-remote.mjs mac-host`. Require a
non-error response with both actual app text and an image. For action acceptance,
use a disposable document and verify state → click/type → state within one
session. Do not publish screenshots, private window titles, credentials or full
process environments. Log zero-turn evidence separately from billing claims.

Keep the release experimental until the new implementation completes these checks.
