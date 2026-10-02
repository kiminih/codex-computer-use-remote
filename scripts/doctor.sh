#!/bin/bash
set -u

CHATGPT_APP="/Applications/ChatGPT.app"
CODEX="$CHATGPT_APP/Contents/Resources/codex"
APP="$HOME/.codex/computer-use/Codex Computer Use.app"
CLIENT="$APP/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
WRAPPER="$HOME/.local/bin/mac-computer-use-mcp"
TEAM_ID="2DC432GLL2"
FAIL=0

pass(){ printf 'PASS  %s\n' "$*"; }
fail(){ printf 'FAIL  %s\n' "$*"; FAIL=1; }
warn(){ printf 'WARN  %s\n' "$*"; }

[[ -d "$CHATGPT_APP" ]] && pass "ChatGPT.app present" || fail "ChatGPT.app missing"
[[ -x "$CODEX" ]] && pass "bundled Codex present" || fail "bundled Codex missing"
[[ -d "$APP" ]] && pass "per-user Computer Use runtime present" || fail "per-user runtime missing"
[[ -x "$CLIENT" ]] && pass "SkyComputerUseClient present" || fail "SkyComputerUseClient missing"
[[ -x "$WRAPPER" ]] && pass "MCP wrapper present" || fail "MCP wrapper missing"

if [[ -x "$CLIENT" ]]; then
  if codesign --verify --deep --strict "$APP" >/dev/null 2>&1; then pass "runtime signature valid"; else fail "runtime signature invalid"; fi
  TEAM="$(codesign -dv --verbose=4 "$CLIENT" 2>&1 | awk -F= '/^TeamIdentifier=/{print $2; exit}')"
  [[ "$TEAM" == "$TEAM_ID" ]] && pass "runtime signed by expected OpenAI Team ID" || fail "unexpected runtime Team ID: $TEAM"
fi

if command -v node >/dev/null; then
  MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  (( MAJOR >= 22 )) && pass "Node $(node -v)" || fail "Node 22+ required; found $(node -v)"
else
  fail "Node not found"
fi

UID_NOW="$(id -u)"
if /bin/launchctl print "gui/$UID_NOW" >/dev/null 2>&1; then pass "GUI launchd domain gui/$UID_NOW exists"; else warn "GUI launchd domain missing (user may not be logged into desktop)"; fi
if pgrep -x Finder >/dev/null 2>&1; then pass "Finder running"; else warn "Finder not running"; fi

if [[ -x /usr/local/sbin/codex-computer-use-gui ]]; then
  pass "SSH/Aqua root launcher installed"
  if sudo -n -l /usr/local/sbin/codex-computer-use-gui >/dev/null 2>&1; then
    pass "passwordless sudo rule covers the SSH/Aqua launcher"
  else
    warn "sudoers rule for SSH/Aqua launcher is missing or requires a password"
  fi
else
  warn "SSH/Aqua root launcher not installed (run install.sh --with-ssh-gui for remote SSH use)"
fi

exit "$FAIL"
