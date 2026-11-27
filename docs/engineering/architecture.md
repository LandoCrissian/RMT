# RMT architecture

See [current engineering status](status.md) for live release evidence and [releases](releases.md) for source and review procedures.

| Boundary | Implementation and ownership |
| --- | --- |
| Public runtime | The existing Sites project serves `rmtlaunch.fun` and its Sites origin. Vinext builds a Cloudflare Worker. `worker/index.ts` handles locale routing, Firebase helpers and selected guards before app routes in `app/`. UI is in `components/`; server behavior is in `lib/server/`. |
| Hosting and auth | `.openai/hosting.json` declares the Worker, D1, R2 and MCP. The app verifies Firebase sessions and maintains legacy identity linking. Site sharing, account authorization and application reviewer/control roles are distinct. Public browsing does not authorize protected actions. |
| D1 `DB` | Accounts and links, directory moderation, claims and ownership, profiles and follows, calendar, notifications, analytics, and LAMMB operational records. See `db/schema.ts` and the append-only `drizzle/` files. The production overview returned 50 table names (all present in the 58-table local fixture), not row contents or a migration ledger. This is not evidence of a production schema mismatch or exact parity. |
| R2 `BUCKET` | Reviewed artwork and assets, along with Radar intelligence, queue, collection and checkpoint objects. Some keys are referenced by D1. A code archive contains neither these objects nor the database. |
| Identity and providers | Firebase identities and account linking, exact operator-role configuration, signed GitHub workload identity, plus provider credentials where used. These are not restored by checking out Git. Keep provider inputs read-only in engineering, and treat source observations as incomplete when a provider fails or is cooling down. |
| Mint Radar | Finalized-chain scanning and source-specific collection evidence. Advance only through verified contiguous blocks, keep field-level provenance and immutable original publication dates, and never let enrichment alone grant eligibility or publish a storefront listing. Keep the expandable 48-hour shelf separate from Radar discoveries. |
| Operations | NFT paper trading, Bitcoin mining evidence and treasury are separate operational surfaces. Public smoke checks and synthetic fixtures do not need a wallet signature, funding, a bidder or production permissions. |
| GitHub | `LandoCrissian/RMT` houses review history, CI and scheduled collectors. GitHub merge, runtime deployment and collector execution are distinct events. A passing CI check on a different SHA is not evidence for a Sites version. |

See [storage](../data-storage.md), [deployment history](../deployment.md), and `docs/operations.md` and `docs/mint-radar-v6.md` on the audited Sites source. This architecture is an as-built map, not a request to migrate.
