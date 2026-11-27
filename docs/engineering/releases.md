# RMT release runbook

## Reconcile before changing anything

1. Query Sites for the latest **successful production deployment**, its exact saved source SHA and prior successful version. Read the current source ref separately. Fetch GitHub `main` and check for concurrent releases or workflow edits. A saved version or branch tip by itself is not proof of live code.
2. In a disposable checkout with both verified refs fetched, use the commands below. Inspect the complete diff and unique history. A clean merge does not prove the destination is allowed to receive the production source, or that future pins will yield the same tree.

   ```sh
   git merge-base <sites-live-sha> <github-main-sha>
   git rev-list --left-right --count <sites-live-sha>...<github-main-sha>
   git diff --stat <github-main-sha> <sites-live-sha>
   git merge-tree --write-tree --name-only <sites-live-sha> <github-main-sha>
   git rev-parse '<sites-live-sha>^{tree}'
   ```

3. If approved separately, create a two-parent integration candidate in an isolated worktree. Attach the tracked tree proof, complete diff review and CI evidence to a PR. Treat workflow and caller changes as operational, even with no Sites deploy. Never overwrite either main with the other. Preserve both histories and check that the merged GitHub commit has the approved source tree. Re-run the comparison if either input moves. Use an exact commit/tree mapping in each release receipt, not a moving branch name.

## CI and production jobs are different

- `check.yml` uses Node 24, lockfile install, typecheck, tests, build and Chromium/WebKit checks against a local Worker with isolated D1 and fixtures. It does not deploy Sites. An unmerged docs PR may run this CI.
- `market-intelligence.yml` and `source-review.yml` run scheduled or manually dispatched operational jobs. Their main-branch jobs can send signed requests to the live application and update collector state or a private review queue. Preserve workflow identity, caller/backend compatibility, scheduling and quotas. Do not dispatch them for feature PR QA. Review the effects of a main merge before it happens.
- GitHub CI and GitHub Actions do not replace the native Sites source/version/artifact flow. Preserve project identity, bindings, custom domain and access policy.

## Acceptance for a separately authorized release

- **Before release** — clean, reviewed topic diff, current base pins, candidate SHA, test logs and evidence for affected paths. For UI, check English and Spanish, phone and desktop, same-tab links, no horizontal overflow and keyboard access. For Radar, verify exact matches, honest stale/missing stats, checkpoint continuity, saved/followed views, and unchanged original publish dates and shelf. For auth, test anonymous, ordinary and owner/reviewer cases with fixtures or an explicitly authorized account. Do not touch real trading, mining or treasury state to verify rendering.
- **If migrations are included** — preserve applied SQL, rehearse on an isolated target and record forward/backward application compatibility, backup evidence and authorization. Test denied permissions, counts and integrity before considering a live migration.
- **When authorized** — reconcile again ahead of Sites source push, save the exact tested source plus its matching build artifact, and publish only that version under the unchanged audience. Verify terminal deployment status. An uncertain save or deployment is a state to reconcile, not an automatic retry.
- **After release** — verify canonical and platform origins, public and protected boundaries, affected flows and read-only collector health. Record prior/next version and deployment IDs, GitHub and Sites SHAs or a verified tree mapping, artifact digest, environment revision (not values), checks, limitations and rollback evidence.
- **If activation fails** — pause and use the [recovery decision tree](recovery.md). Reverting code does not revert data, settings, provider actions or external writes.
