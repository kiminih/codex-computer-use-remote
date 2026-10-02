#!/usr/bin/env python3
"""Apply the remote zero-auth compatibility patch to upstream direct-broker.ts.

The patch is intentionally narrow and fails closed when the upstream structure
changes in ways we do not recognize.
"""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count == 0 and new in text:
        return text
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected one match, found {count}")
    return text.replace(old, new, 1)


def patch(path: Path) -> None:
    s = path.read_text()

    s = replace_once(
        s,
        'import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";',
        'import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";',
        "fs/promises import",
    )

    if 'CODEX_SQLITE_HOME: path.join(codexHome, "sqlite"),' not in s:
        s = replace_once(
            s,
            '\t\tCODEX_HOME: codexHome,\n',
            '\t\tCODEX_HOME: codexHome,\n\t\tCODEX_SQLITE_HOME: path.join(codexHome, "sqlite"),\n',
            "CODEX_SQLITE_HOME env",
        )

    lines = s.splitlines()
    start = next((i for i, line in enumerate(lines) if "function buildBrokerEnv" in line), None)
    if start is None:
        raise SystemExit("ERROR: buildBrokerEnv not found")
    depth = 0
    seen = False
    end = None
    for i in range(start, len(lines)):
        depth += lines[i].count("{")
        depth -= lines[i].count("}")
        if "{" in lines[i]:
            seen = True
        if seen and depth == 0:
            end = i
            break
    if end is None:
        raise SystemExit("ERROR: buildBrokerEnv end not found")
    path_lines = [i for i in range(start, end + 1) if lines[i].lstrip().startswith("PATH:")]
    if len(path_lines) != 1:
        raise SystemExit(f"ERROR: expected one PATH in buildBrokerEnv, found {len(path_lines)}")
    i = path_lines[0]
    indent = lines[i][: len(lines[i]) - len(lines[i].lstrip())]
    lines[i] = indent + 'PATH: `${path.dirname(CODEX_PATH)}:/usr/bin:/bin:/usr/sbin:/sbin`,'
    s = "\n".join(lines) + "\n"

    old_mcp = 'cwd = ${JSON.stringify(mcpCwd)}, enabled = true'
    new_mcp = 'cwd = ${JSON.stringify(mcpCwd)}, env_vars = ["CODEX_HOME", "CODEX_SQLITE_HOME"], enabled = true'
    if new_mcp not in s:
        s = replace_once(s, old_mcp, new_mcp, "Computer Use MCP env forwarding")

    marker = 'const directConfig = ['
    if marker not in s:
        old_setup = '''\tawait mkdir(codexHome, { mode: 0o700 });
\tawait mkdir(workDir, { mode: 0o700 });
\tawait writeFile(path.join(codexHome, "config.toml"), "", { mode: 0o600 });'''
        new_setup = '''\tawait mkdir(codexHome, { mode: 0o700 });
\tawait mkdir(path.join(codexHome, "sqlite"), { mode: 0o700 });
\tconst runtimeDir = path.join(codexHome, "computer-use");
\tawait mkdir(runtimeDir, { mode: 0o700 });
\tif (verification.client) {
\t\tawait symlink(
\t\t\tverification.client.appPath,
\t\t\tpath.join(runtimeDir, "Codex Computer Use.app"),
\t\t\t"dir",
\t\t);
\t}
\tawait mkdir(workDir, { mode: 0o700 });
\tconst directConfig = [
\t\t'model_provider = "direct_disabled"',
\t\t'model = "direct-disabled"',
\t\t'',
\t\t'[model_providers.direct_disabled]',
\t\t'name = "Direct dispatch disabled provider"',
\t\t'base_url = "http://127.0.0.1:9/v1"',
\t\t'wire_api = "responses"',
\t\t'request_max_retries = 0',
\t\t'stream_max_retries = 0',
\t\t'supports_websockets = false',
\t\t'requires_openai_auth = false',
\t\t'',
\t].join("\\n");
\tawait writeFile(path.join(codexHome, "config.toml"), directConfig, { mode: 0o600 });'''
        s = replace_once(s, old_setup, new_setup, "isolated runtime/config setup")

    required = [
        'CODEX_SQLITE_HOME: path.join(codexHome, "sqlite")',
        'PATH: `${path.dirname(CODEX_PATH)}:/usr/bin:/bin:/usr/sbin:/sbin`',
        'env_vars = ["CODEX_HOME", "CODEX_SQLITE_HOME"]',
        'const runtimeDir = path.join(codexHome, "computer-use")',
        'requires_openai_auth = false',
    ]
    missing = [item for item in required if item not in s]
    if missing:
        raise SystemExit("ERROR: patch incomplete: " + ", ".join(missing))

    path.write_text(s)
    print(f"patched {path}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?", default="src/direct-broker.ts")
    args = ap.parse_args()
    path = Path(args.source)
    if not path.is_file():
        raise SystemExit(f"ERROR: source file not found: {path}")
    patch(path)


if __name__ == "__main__":
    main()
