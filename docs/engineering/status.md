# RMT engineering status

Audit date: **November 26, 2026 (America/Denver)**. This is a dated snapshot. Refresh both refs for each new task.

| Item | Verified state |
| --- | --- |
| Application authority | The last successful Sites release was **131**, commit `4053ea8c56a4b6c9815630b3f2ecc72f64b0854c`, tree `29025d3b0737183c5c742dedc7702c6954ea420b`. The Sites source branch was at the same commit. The audience is public. |
| Operational source | Public GitHub `LandoCrissian/RMT` default branch was `4459b9bb96420d3148b20bc068f2f7e946f6c32a`. GitHub did not have the exact deployed SHA. |
| Divergence | Merge base `66266ec91a5cb798332f35cfc9425b5c15e9a336`. Sites had 106 commits not reachable from GitHub main and GitHub had 42 not reachable from Sites. The tip-to-tip diff covered 397 paths. Identical workflow files and selected caller scripts did not imply identical application trees. |
| Reconciliation rehearsal | Local `git merge-tree` reported no conflicts and produced exactly the deployed Sites tree above. This preserves both histories without requiring an application tree change at those pins. No branch was merged or promoted. |
| Collector | [Existing signed Radar run](https://github.com/LandoCrissian/RMT/actions/runs/45888009522) had a successful discovery job. This is operational evidence about the Site it called, not a proof that GitHub main built it or that a new branch can call it. No production job was dispatched in this audit. |
| Public smoke | The platform origin returned 200 for the homepage, Spanish Radar, catalog/session/intelligence APIs, paper trading, Bitcoin mining and treasury. This runner received a gateway-blocked 403 on the custom domain. Verify separately on a normal phone connection before claiming custom-domain acceptance. |
| Recovery | The Sites database overview returned 50 D1 table names, which all exist among the 58 tables created locally by 24 tracked migrations. The other eight names were not returned. No provider migration ledger or independently verified live inventory was available, so the reason for the difference and full parity are unverified. No private rows were read. A synthetic SQLite dump and restore passed exact dump equality, fixture, integrity, and foreign-key checks. Native access to a consistent export/independent restore, coordinated D1/R2/Firebase point, and production RPO/RTO are unverified. |

## Readiness

- Isolated documentation, review and fixture-based development can proceed. The GitHub review branch carries docs only and is **not a replacement for the deployed app source**.
- Before treating GitHub as the future application development base, approve the destination and visibility for production-origin source, review the complete diff, prove the candidate tree, run CI against it, and explicitly authorize a merge. The existing repository is public. This is not a proposal to make it private or change the live Site audience.
- Before enabling engineering releases, verify the owner’s Cloud setup from iOS, smoke-test the canonical domain from a normal network, and agree a release owner and rollback decision. Before production schema/storage changes, verify a separate restore path or keep those changes out of scope.
