# Test status

## Standalone 0.2.0

Recorded on 2026-10-01 (Pacific time; CI completed on 2026-10-02 UTC):

| Check | Result | Scope |
| --- | --- | --- |
| `node scripts/check.mjs` | 21 checks passed | JavaScript/shell syntax and empty npm dependency sets |
| Local `node --test test/*.test.mjs` | 80 passed, 0 failed | Linux, Node.js 22.16.0; standard-library tests and local subprocess fixtures |
| GitHub Actions: Ubuntu | Passed | The same syntax and automated test suite on `ubuntu-latest` |
| GitHub Actions: macOS | 80 passed, 0 failed | macOS 14.8.9 ARM64, Node.js 22.23.2; the same syntax and automated test suite |
| Fresh install on a physical Mac | Not run | Requires user-owned ChatGPT.app and macOS permissions |
| Signed runtime Finder screenshot on 0.2.0 | Not run | Do not substitute the historical result below |
| SSH → Aqua → Finder on 0.2.0 | Not run | Requires the target Mac and remote client |

CI evidence: [Tests run 36964352046](https://github.com/kiminih/codex-computer-use-remote/actions/runs/36964352046).
Both jobs completed successfully before PR #1 was merged. The tested source
commit was `b1b274b26f1700dbdee8277f5d279aa028435743`, with source tree
`45198267fe4433513252e051e5ea97c82c69dd45`.

The suite covers schemas, bounded and fragmented JSONL, protocol negotiation,
initialization, request correlation, cancellation, consent responses, screenshot
block forwarding, runtime mapping, environment isolation, session reuse, idle
expiry, model-turn guards, subprocess failures, detached-descendant cleanup,
no-argument launcher construction, and full MCP-to-child-RPC behavior. EOF,
SIGINT and SIGTERM teardown are exercised with real fixture subprocesses.

Fixtures do not simulate the complete proprietary runtime, signatures, TCC,
LaunchServices, Aqua sessions, workspace entitlements or app-specific behavior.
The macOS CI result validates this test suite on macOS, not live Computer Use
against an installed ChatGPT.app or an interactive Finder desktop.

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
