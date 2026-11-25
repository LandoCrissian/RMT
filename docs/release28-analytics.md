# Release 28 analytics

Verified project managers open **Developer Studio → My projects → Analytics**. Control Center **Insights** provides platform totals. Saved member identities, followers, private interests and individual visitor events are excluded from the report APIs.

| Measure | Basis |
| --- | --- |
| Page views | Accepted project views, deduplicated by browser tab, project and UTC day. |
| Visitors | Distinct anonymous browser identifiers scoped to a project. Rotation, private browsing, multiple devices and storage loss affect the estimate. No identity matching across projects. |
| Discovery CTR | Directory card opens divided by corresponding card impressions, with matching scope and deduplication. An empty denominator produces no rate. |
| External clicks | Actions opening project destinations, grouped by destination site. |
| Shares | Initiations of native sharing, copy-link or X sharing. No completed-post count is available. |
| Following and saves | Current member totals and aggregate changes from committed database operations. An imported or retried duplicate edge does not create another change. |
| Referrals | Coarse landing-referrer categories. Unknown and internal visits are separate from identifiable external visits outside X. |
| Registrations | Provider-supplied account creation dates observed through existing sign-in and account checks. Accounts that have never supplied this date are uncounted. |

Release 28 collection starts prospectively. Earlier measurements retain their original definitions. The detailed window is 90 days and daily aggregates are retained for up to 365 days. The all-time view reports available retained history. Missing comparison coverage is labeled. Dates use UTC. Public telemetry respects DNT and GPC, filters common bots and deduplicates and caps admitted signals at 2,000 per UTC day. Privacy filters, capped or lost signals, and client-reported interactions limit coverage.

The infrastructure panel reports application telemetry slots, rolling wallet verification slots, ready artwork bytes and database size when supplied by D1. The managed runtime provides no account-wide CPU or billing-quota feed.

## Release 27 discovery 503

The archived local Worker log recorded one Miniflare D1 internal query failure (reference `p1n318t8joedkgua47jror71`) on GET /api/discovery. Surrounding requests succeeded. The QA fixture tool opened the same local SQLite database during that run. The stack did not identify a lock, exhausted quota, or production dependency as the cause.

For Release 28 the isolated fixture database was populated before starting the Worker. A run of 32 interleaved requests at concurrency four exercised discovery, catalog and analytics ingestion. All returned 200. Nine read-only production observations before rollout also returned 200. These are availability samples; host-wide capacity and the exact cause of the historical error remain unknown.
