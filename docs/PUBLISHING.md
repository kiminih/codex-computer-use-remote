# Publishing

1. Run the syntax checks and automated tests:

   ```bash
   node scripts/check.mjs
   node --test test/*.test.mjs
   ```

2. Check that CI passes. Complete the [desktop tests](TESTED.md#desktop-acceptance) and record the version and results. Use a prerelease label while desktop validation is pending.
3. Review the diff, version markers, license and attribution. Keep runtime imports limited to Node built-ins and local modules.
4. Exclude proprietary binaries, credentials, TCC databases, private keys and personal captures.
5. Tag the tested commit, create the GitHub Release and verify that its source and any attached archives match the tag.
