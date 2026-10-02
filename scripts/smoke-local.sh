#!/bin/bash
set -euo pipefail

BASE="${CODEX_CU_REMOTE_HOME:-$HOME/.local/share/codex-computer-use-remote}"
BROKER="$BASE/upstream/dist/direct-broker.js"
if [[ ! -f "$BROKER" ]]; then
  echo "ERROR: patched broker not installed; run scripts/install.sh first" >&2
  exit 1
fi

cd "$BASE/upstream"
node --input-type=module <<'JS'
import { callOfficialDirectTool } from "./dist/direct-broker.js";
const result = await callOfficialDirectTool(
  "get_app_state",
  { app: "Finder" },
  { timeoutMs: 120000 }
);
console.log(JSON.stringify({
  isError: result.isError,
  modelTurnsStarted: result.modelTurnsStarted,
  brokerCleanupVerified: result.brokerCleanupVerified,
  content: result.content.map(x => x.type === "image"
    ? { type: "image", mimeType: x.mimeType, data: "<omitted>" }
    : x)
}, null, 2));
if (result.isError || result.modelTurnsStarted !== 0) process.exit(1);
JS
