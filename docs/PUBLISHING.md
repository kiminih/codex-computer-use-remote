# Publishing checklist

Before publishing this repository:

1. Confirm the repository URL in both READMEs is correct.
2. Keep `NOTICE.md` and the upstream MIT attribution.
3. Do not commit any of these from a test Mac:
   - `~/.codex/auth.json`
   - `Codex Computer Use.app`
   - ChatGPT.app contents
   - TCC.db or TCC backups
   - SSH private keys
   - screenshots/app-state captures containing user data
4. Re-run:

   ```bash
   bash -n scripts/*.sh
   python3 -m py_compile scripts/patch-upstream.py
   ```

5. On a clean Mac, test:

   ```bash
   ./scripts/install.sh
   ./scripts/doctor.sh
   ./scripts/smoke-local.sh
   ```

6. For remote claims, also test the final SSH/Aqua path end to end:

   ```bash
   ./scripts/install.sh --with-ssh-gui
   timeout 5 ssh -T mac-host 'sudo -n /usr/local/sbin/codex-computer-use-gui'
   ```

   Then invoke `get_app_state({"app":"Finder"})` from the remote MCP client.

7. Pin an upstream commit or release before calling a release stable. The current
   installer deliberately follows `main` but fails closed if the source pattern
   no longer matches.

Suggested first release label: **v0.1.0 experimental**.
