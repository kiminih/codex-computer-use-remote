#!/bin/bash
set -euo pipefail

WITH_SSH_GUI=0
if [[ "${1:-}" == "--with-ssh-gui" ]]; then
  WITH_SSH_GUI=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--with-ssh-gui]" >&2
  exit 2
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: installer must run on macOS" >&2
  exit 1
fi

CHATGPT_APP="/Applications/ChatGPT.app"
CODEX="$CHATGPT_APP/Contents/Resources/codex"
TEAM_ID="2DC432GLL2"
USER_HOME="$HOME"
USER_NAME="$(id -un)"
USER_UID="$(id -u)"
BASE="${CODEX_CU_REMOTE_HOME:-$USER_HOME/.local/share/codex-computer-use-remote}"
UPSTREAM="$BASE/upstream"
BIN_DIR="$USER_HOME/.local/bin"
MCP_WRAPPER="$BIN_DIR/mac-computer-use-mcp"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node || true)"

if [[ ! -d "$CHATGPT_APP" || ! -x "$CODEX" ]]; then
  echo "ERROR: official ChatGPT.app with bundled Codex not found at $CHATGPT_APP" >&2
  exit 1
fi
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: Node.js 22+ is required" >&2
  exit 1
fi
NODE_MAJOR="$($NODE_BIN -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < 22 )); then
  echo "ERROR: Node.js 22+ required; found $($NODE_BIN -v)" >&2
  exit 1
fi
for cmd in git npm python3 codesign ditto; do
  command -v "$cmd" >/dev/null || { echo "ERROR: missing command: $cmd" >&2; exit 1; }
done

RUNTIME_DST="$USER_HOME/.codex/computer-use/Codex Computer Use.app"
if [[ ! -d "$RUNTIME_DST" ]]; then
  RUNTIME_SRC="$CHATGPT_APP/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app"
  if [[ ! -d "$RUNTIME_SRC" ]]; then
    RUNTIME_SRC="$(find "$CHATGPT_APP/Contents/Resources" -type d -name 'Codex Computer Use.app' -print -quit 2>/dev/null || true)"
  fi
  if [[ -z "$RUNTIME_SRC" || ! -d "$RUNTIME_SRC" ]]; then
    echo "ERROR: bundled Codex Computer Use.app not found inside ChatGPT.app" >&2
    exit 1
  fi
  mkdir -p "$USER_HOME/.codex/computer-use"
  echo "Installing local per-user runtime from existing ChatGPT.app..."
  ditto "$RUNTIME_SRC" "$RUNTIME_DST"
fi

CLIENT="$RUNTIME_DST/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
codesign --verify --deep --strict "$RUNTIME_DST"
CLIENT_TEAM="$(codesign -dv --verbose=4 "$CLIENT" 2>&1 | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
if [[ "$CLIENT_TEAM" != "$TEAM_ID" ]]; then
  echo "ERROR: Computer Use client TeamIdentifier=$CLIENT_TEAM; expected $TEAM_ID" >&2
  exit 1
fi
CODEX_TEAM="$(codesign -dv --verbose=4 "$CODEX" 2>&1 | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
if [[ "$CODEX_TEAM" != "$TEAM_ID" ]]; then
  echo "ERROR: Codex TeamIdentifier=$CODEX_TEAM; expected $TEAM_ID" >&2
  exit 1
fi

mkdir -p "$BASE" "$BIN_DIR"
if [[ -d "$UPSTREAM/.git" ]]; then
  git -C "$UPSTREAM" fetch --depth 1 origin main
  git -C "$UPSTREAM" reset --hard origin/main
  git -C "$UPSTREAM" clean -fdx
else
  rm -rf "$UPSTREAM"
  git clone --depth 1 https://github.com/tmustier/codex-computer-use-mcp.git "$UPSTREAM"
fi

UPSTREAM_VERSION="$($NODE_BIN -p "require('$UPSTREAM/package.json').version")"
echo "Upstream codex-computer-use-mcp version: $UPSTREAM_VERSION"
python3 "$PROJECT_ROOT/scripts/patch-upstream.py" "$UPSTREAM/src/direct-broker.ts"
(
  cd "$UPSTREAM"
  npm ci
  npm run build
)

cat > "$MCP_WRAPPER" <<EOF2
#!/bin/zsh
export PATH="$(dirname "$NODE_BIN"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
exec "$NODE_BIN" "$UPSTREAM/dist/mcp-server.js"
EOF2
chmod 755 "$MCP_WRAPPER"

echo "Installed MCP wrapper: $MCP_WRAPPER"

if (( WITH_SSH_GUI )); then
  ROOT_WRAPPER="/usr/local/sbin/codex-computer-use-gui"
  SUDOERS="/etc/sudoers.d/codex-computer-use-gui"
  TMP_WRAPPER="$(mktemp)"
  cat > "$TMP_WRAPPER" <<EOF2
#!/bin/sh
exec /bin/launchctl asuser $USER_UID /usr/bin/sudo -u $USER_NAME -H $MCP_WRAPPER
EOF2
  sudo mkdir -p /usr/local/sbin
  sudo install -o root -g wheel -m 0755 "$TMP_WRAPPER" "$ROOT_WRAPPER"
  rm -f "$TMP_WRAPPER"

  TMP_SUDOERS="$(mktemp)"
  printf '%s ALL=(root) NOPASSWD: %s\n' "$USER_NAME" "$ROOT_WRAPPER" > "$TMP_SUDOERS"
  sudo install -o root -g wheel -m 0440 "$TMP_SUDOERS" "$SUDOERS"
  rm -f "$TMP_SUDOERS"
  sudo visudo -c
  echo "Installed SSH/Aqua launcher: $ROOT_WRAPPER"
  echo "Installed narrow sudoers rule: $SUDOERS"
fi

echo
echo "Install complete."
echo "Run: $PROJECT_ROOT/scripts/doctor.sh"
