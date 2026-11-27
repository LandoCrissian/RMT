# RMT incident and recovery runbook

## Contain and classify

Capture time, latest successful version/SHA, failing surface and read-only symptoms. Check the platform origin and canonical domain separately. Identify whether the failure is a code regression, bad runtime setting, provider outage, data incident, or some combination. Preserve receipts and avoid retries that advance published state. Never paste credentials, member data, archives or identity tokens into PRs, logs or Codex.

| Failure | Safe first move | Recovery boundary |
| --- | --- | --- |
| Code or UI | Reproduce with fixtures on the known good and bad commits. Check prior saved version status and whether it still works with current schema and runtime bindings. | An authorized operator can republish a verified compatible saved version. That does not restore or revert data, permissions, secrets or external systems. |
| Stale collector | Read watermarks, errors and cooldowns without dispatching a job. Distinguish provider lag from a cursor gap. | Only authorized operator recovery should resume the existing signed, bounded collector. Do not advance a cursor past unverified blocks or clear provider cooldowns. |
| DB corruption or mistaken write | Freeze further change decisions, record affected scope, and confirm provider access and recoverable timestamps without reading private rows into engineering. | Use a separate verified restore target. Cloudflare Time Travel overwrites its target in place and cannot clone a database. It is not an isolated rehearsal tool. |
| Missing assets, identity or settings | Compare references, asset hashes and provider attestations in an isolated target. Review auth by canonical identity, not display name or email. | D1, R2, Firebase and runtime settings recover independently. Do not rotate keys, rebind resources or cut over as part of diagnosis. |

## Rehearse before relying on recovery

1. Start on an empty SQLite or disposable D1 target with synthetic data. Apply the tracked migrations, restore a fixture and check schema, `integrity_check`, foreign keys, counts, owner/member boundaries and artwork references. No production connection.
2. For a follow-up operator-approved production-like drill, confirm the actual managed export path and its impact first. Cloudflare documents D1 SQL export/import, but the connected Sites surface in this audit provided overview only for this use case, not a verified backup/restore operation. A previous bounded application-level transfer (`docs/application-level-recovery-transfer.md` on the Sites source) does not establish provider-native backup retention, capture consistency or an independently restored production clone. Keep it disabled unless explicitly approved.
3. Independently verify R2 inventory and object byte hashes, private/public metadata, Firebase UID and link preservation, and separate secret custody. Record capture windows and skew unless a common cutoff is independently proven. For recovery from snapshots, match references to restored objects before considering any cutover.
4. Record start/finish, source/target identity, scope, what was withheld, validation results and measured or unknown recovery point/time. A passing synthetic/local drill does not prove production RPO or RTO.

Reference: [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/) · [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) · `docs/scalable-recovery.md` on the Sites source.
