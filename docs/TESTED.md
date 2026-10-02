# Test status

## v0.2.0 — experimental

Recorded on October 1, 2026, Pacific time. CI completed on October 2, UTC.

| Check | Result | Environment |
| --- | --- | --- |
| Syntax and dependency checks | 21 passed | JavaScript and shell |
| Local automated suite | 80 passed, 0 failed | Linux, Node.js 22.16.0 |
| GitHub Actions: Linux | Passed | Ubuntu |
| GitHub Actions: macOS | 80 passed, 0 failed | macOS 14.8.9 ARM64, Node.js 22.23.2 |
| Fresh install on a physical Mac | Not run | User-installed ChatGPT.app |
| Finder text and screenshot | Not run | Live Computer Use runtime |
| SSH → desktop session → Finder | Not run | Target Mac and controller |

[CI run 36964352046](https://github.com/kiminih/codex-computer-use-remote/actions/runs/36964352046) tested commit `b1b274b26f1700dbdee8277f5d279aa028435743`, tree `45198267fe4433513252e051e5ea97c82c69dd45`.

The automated suite covers protocol framing, schemas, session reuse, approvals, cancellation, model-turn checks and subprocess cleanup. It uses local fixtures, not the proprietary runtime or a live desktop.

## Earlier compatibility build

Finder text and a JPEG screenshot were returned with the Mac CLI logged out and `modelTurnsStarted: 0` on macOS 26.5.1, ChatGPT.app 26.903.61454 build 8378, Codex CLI 0.153.4 and Computer Use build 1000968, on Apple Silicon.

The SSH launcher started, but its final Finder read was not recorded. These results apply to the earlier build, not v0.2.0.

## Desktop acceptance

On the Mac:

```bash
bash scripts/doctor.sh
bash scripts/smoke-local.sh
```

On the controller:

```bash
node scripts/smoke-remote.mjs mac-host
```

Require a non-error response with app text and an image. Test click and typing in a disposable document, using read → action → read within one session. Record versions, results and zero-turn observations; remove private content before sharing.

Keep v0.2 experimental until installation, local actions and remote actions pass on a real Mac.
