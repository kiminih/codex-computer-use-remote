# Changelog

## 0.2.0 — 2026-10-01 — Experimental

- Replaced upstream checkout, text patching, npm installation and compilation with a standalone Node.js implementation.
- Added bounded JSONL transport, negotiated MCP 2025 profiles, request validation and cancellation.
- Retained signed runtime verification, isolated account/configuration paths, runtime mapping and nested Codex PATH discovery.
- Added serialized native sessions, element-context checks, idle expiry and scoped process cleanup.
- Forwarded supported runtime consent requests; cancelled unsupported requests without auto-approval.
- Added offline staged installation, previous-wrapper backups, rollback and a no-arguments GUI launcher.
- Added automated tests and direct local/SSH smoke commands that do not request model inference.
- Kept macOS live validation separate from automated protocol and process tests.

## 0.1.0 — 2026-09-09

- Initial packaging of zero-auth compatibility work around the upstream bridge.
- Added isolated SQLite-home forwarding, runtime mapping, persisted disabled model configuration and Codex PATH discovery.
- Added SSH/Aqua launcher and diagnostic scripts.
