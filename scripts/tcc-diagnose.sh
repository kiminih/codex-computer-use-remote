#!/bin/bash
set -euo pipefail
MINUTES="${1:-5}"
[[ "$MINUTES" =~ ^[0-9]+$ ]] && (( MINUTES >= 1 && MINUTES <= 60 )) || { echo "Minutes must be 1..60" >&2; exit 2; }
/usr/bin/log show --last "${MINUTES}m" --style compact --predicate 'process == "tccd"' | grep -Ei 'sshd-keygen-wrapper|com\.openai\.sky\.CUAService|AppleEvents|Accessibility|ScreenCapture' || true
