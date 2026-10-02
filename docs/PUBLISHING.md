# Publishing checklist

1. Run `node scripts/check.mjs` and `node --test test/*.test.mjs` without installing packages.
2. Confirm the runtime imports only Node built-ins and local modules.
3. Review the source diff, NOTICE.md and version markers. Retain upstream attribution.
4. Keep binaries, credentials, TCC databases, private SSH keys and real screenshots out of commits.
5. Check GitHub Actions separately; never infer workflow success from a pushed commit.
6. Complete the physical-Mac and remote checks in TESTED.md before claiming GUI compatibility for a new rewrite.
7. Use an experimental/prerelease label until hardware acceptance is complete.

A source commit, a tag and a GitHub Release are distinct publication steps. Do
not report a release object or attached archive as published without checking it.
