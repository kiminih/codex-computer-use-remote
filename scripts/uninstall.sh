#!/bin/bash
set -euo pipefail

REMOVE_RUNTIME=0
if [[ "${1:-}" == "--remove-runtime" ]]; then
  REMOVE_RUNTIME=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--remove-runtime]" >&2
  exit 2
fi

BASE="${CODEX_CU_REMOTE_HOME:-$HOME/.local/share/codex-computer-use-remote}"
rm -f "$HOME/.local/bin/mac-computer-use-mcp"
rm -rf "$BASE"

if [[ -e /usr/local/sbin/codex-computer-use-gui || -e /etc/sudoers.d/codex-computer-use-gui ]]; then
  sudo rm -f /usr/local/sbin/codex-computer-use-gui /etc/sudoers.d/codex-computer-use-gui
fi

if (( REMOVE_RUNTIME )); then
  rm -rf "$HOME/.codex/computer-use/Codex Computer Use.app"
fi

echo "Uninstalled. ChatGPT.app was not modified."
