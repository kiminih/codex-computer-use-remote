#!/bin/bash
set -euo pipefail

MINUTES="${1:-20}"
/usr/bin/log show --last "${MINUTES}m" --style compact \
  --predicate 'process == "tccd"' 2>/dev/null \
  | grep -Ei 'sshd-keygen-wrapper|com\.openai\.sky\.CUAService|AppleEvents|Accessibility|ScreenCapture|deny|denied|reject|rejected' \
  || true
