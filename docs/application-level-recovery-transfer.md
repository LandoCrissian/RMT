# RMT application-level recovery transfer

## Status and boundaries

This candidate is based on Sites version 34, commit `a8cbb20930163af2fce5caf7da5ea068d70b5443`. It adds a disabled-by-default route at `/api/control/recovery-transfer`. It does not modify the existing capacity-only endpoint, production migrations, storage bindings, access policy, or Firebase configuration. No support request, resource provisioning, production download, write pause, billing change, or cutover is part of this change. Production recovery is unverified.

This provides a bounded **one-off transfer** and an owner-held encrypted copy. It does not replace native point-in-time recovery, exercise a remote Cloudflare restore, or establish production backup retention, scheduled recovery, Firebase user export, or a cutover-ready common recovery point. Do not enable this route permanently.

## Consistency and limits

- D1 discovery and sizing are not a snapshot. A final documented transactional D1 `batch()` captures the exact SQLite schema and row data together. It repeats byte/row checks inside that batch. No paging across D1 sessions, bookmark logic, arbitrary SQL, or D1 Time Travel is used. DDL, indexes, views, triggers, named identifiers, SQLite rowids, SQLite storage classes, recognized migration ledger rows (including the managed Sites `__appgarden_migrations` ledger) and the SQLite sequence are retained when present. Known Cloudflare-maintained metadata tables and SQLite optimizer statistics are excluded. Unknown application tables, virtual/generated columns, schema drift, truncated results and unsupported sizes fail closed.
- The dedicated `preflight` mode returns counts and sizing only. It inspects at most 10,001 rows per table. A capped count is a lower bound, not a complete size measurement. A `wire_size` result measures the export budget. If schema inspection or wire sizing fails, `application_counts_only` reports bounded application table counts and a fixed failure-stage label. It identifies missing expected tables and reports the number of unknown tables and a bounded list of safe-format identifiers to the authenticated owner only. Its `fits` and byte fields remain null, so it never authorizes an export. The database export requires at most 10,000 rows per table, at most 1 MiB for an encoded row and a total 8 MiB budget for encoded rows plus per-row transport headroom. These are operational caps for this Worker build, not claims about available production capacity. The old 2,000-row and 12 MiB limits reported by the prior endpoint describe the earlier design.
- R2 walks full cursor-based listings, checks version/ETag/size on each fetched object, keeps original bytes and metadata, uses SHA-256 per object, and compares a second full inventory before emitting its authenticated completion frame. Limits are 256 objects, 128 MiB total and 12 MiB per object. An expired connection, unstable listing or partial archive is a failure. These checks detect observed changes; they do not guarantee a cross-service snapshot or a bucket-wide point-in-time copy under arbitrary writes.
- Local restore checks all restored rows, schema, SQLite integrity and foreign keys, matching archive capture IDs, and ready artwork references (key, size and digest when present). It does not assert that active, in-flight, pending or after-capture changes were transferred. Record D1 and R2 capture times separately. Keep the existing Firebase project in service; its auth records are not part of these downloads. Verify real Firebase sign-in, preserved user IDs and legacy-only account recovery on an isolated cloud target before proposing cutover.

Cloudflare references: [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [R2 operations](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Prepare and review without production changes

1. Review the exact branch diff and test evidence. Confirm the live site and rollback version before any separately approved publication. Start with **none** of the transfer bindings configured. The route must return a non-cacheable 404 in that state. Do not use the old exporter.
2. Prepare a local, access-restricted encrypted directory outside the repository and synced folders. Use Node 24. Generate a dedicated RSA key using the command below. Only the printed base64 SPKI public key belongs in Sites. Back up the private key independently using owner-controlled encrypted storage and verify that backup restores the key. Never put the private key, credentials, archives, private restore files or real identifiers in the repository, logs, issues, telemetry, or conversations.

   ```sh
   node scripts/recovery-transfer.mjs keygen <new-owner-private-key.pem>
   ```

3. Use a new random UUID v4 for a rehearsal pair. Plan the aggregate preflight first. Assess production workload, restore reference check results, provider settings that cannot be independently inspected, and whether the bounded design fits before any actual data capture. If it does not fit, stop rather than split database reads across unfrozen snapshots or increase Worker limits blindly.

## Operation, only after the applicable owner approval

Configure one mode at a time with server settings. These are runtime bindings, not values accepted from a browser.

| Binding | Requirement |
| --- | --- |
| `RMT_TRANSFER_OWNER_UID` | Exact immutable Firebase UID, also present in `RMT_ADMIN_USER_IDS` as `firebase:<uid>` |
| `RMT_TRANSFER_START` and `RMT_TRANSFER_UNTIL` | Explicit ISO UTC timestamps, active for at most ten minutes |
| `RMT_TRANSFER_MODE` | One of `preflight`, `database`, or `artwork` |
| `RMT_TRANSFER_CAPTURE_ID` | Same new UUID v4 for database and artwork in a single rehearsal; not required for preflight |
| `RMT_TRANSFER_PUBLIC_KEY` | Base64 SPKI from owner key generation; not required for preflight |

Use the designated verified Firebase owner account on the canonical RMT origin. Only the aggregate preflight accepts a verified owner sign-in from up to 30 minutes earlier. A download still requires reauthentication within five minutes. Directly visit the recovery route on that same origin. The transfer form posts only the fixed configured action and never reads or relays session credentials. A session older than five minutes cannot start or continue a download. The account is checked for revocation and disabled/deleted state before each download begins. Archives are encrypted in the Worker before transmission, using RSA-OAEP-SHA-256 to wrap a random archive AES-256-GCM key and an authenticated sequence of frames. The private key remains on the owner machine. Envelope integrity does not replace provenance: only restore the files the owner downloaded from the intended site over HTTPS. Verify the transfer finishes before expiration. Do not retry a failed export automatically.

Clear the mode, window, UID, capture ID and public key promptly after use. Verify anonymous and owner requests are back to HTTP 404 with no-store headers. A database request that was already running may finish internally; it is not emitted after its window. Retain a Sites application rollback if smoke checks fail. Never overwrite live D1 or use a production point-in-time rewind.

## Verify and restore locally

Download the paired files to the prepared owner-controlled directory. Obtain both archives before invoking restore. The output directory must not exist. The command rejects wrong keys, tampering, truncation, mixed capture IDs and missing/inconsistent artwork references. On failure it does not retain a partial verified restore. The restore is plaintext by design, so use a private encrypted volume, not a shared or repo directory. Windows requires proper ACLs in addition to device encryption.

```sh
node scripts/recovery-transfer.mjs restore <owner-private-key.pem> <rmt-database.rmtenc> <rmt-artwork.rmtenc> <new-restore-dir>
```

The local result contains `rmt.sqlite`, an `artwork` directory with numbered files and original R2 metadata in `inventory.json`, and an aggregate `receipt.json`. The artifacts enable a separately authorized rehearsal on empty owner-controlled resources. Destination R2 assigns its own version and upload time; preserve the source values in the manifest, and restore original object keys, bytes and configurable HTTP/custom metadata. Do not upload archives or output directories to GitHub. Keep a verified copy of encrypted archives outside Sites.

Before any production cutover, prove a final single-writer handoff or a complete, verified reconciliation of all changes and deletes across D1 and R2. Verify a separate Firebase authentication recovery plan. Then measure recovery time and point, establish a rollback that reconciles any new writes, and seek the owner's cutover approval.
