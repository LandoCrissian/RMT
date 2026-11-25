# Project claim eligibility

The claim screen and Control Center project detail evaluate the current, approved public listing. Opening the directory does not launch DNS or RPC requests. Hidden listings, unknown contract models, conflicting project references and unavailable evidence retain manual verification. Assessment does not change a claim, grant ownership, or replace administrator approval.

## Current directory

Release 28's 23 baseline listings resolve to one independently reviewed binding (Bored Traders), two known proxy deployments (MoneyMomos and WIF Outlaws), and 20 without an explicit Robinhood Chain contract reference. The Bored Traders fast path requires the original project ID, contract address, website origin and published whitepaper link to remain consistent. Its authority and bytecode are independently rechecked on chain during wallet verification and approval. [Release 27 deployment evidence](release27-contract-evidence.md)

## A new project or contract

1. Have the single canonical management contract linked on the approved listing as `https://robinhoodchain.blockscout.com/address/0x…` or `/token/0x…`. The official website must be a project-controlled HTTPS host. A profile path on a shared service cannot establish the domain.
2. Publish one DNSSEC-signed TXT record on `_rmt-ownership.<exact official website host>`. Use the RMT project ID and lowercase contract address. The value must exactly match `rmt-project=<project-id>;chain=4663;contract=<0x-address>`. Use one record and a positive TTL. Keep it published throughout review. CNAME aliases and unsigned DNS answers require manual review.
3. Open the project's claim screen. RMT checks the published listing, two independent DNS resolvers and two Robinhood Chain RPC providers. Eligibility requires a byte-for-byte match to an independently reviewed standalone runtime, a nonzero administrative owner, consistent confirmed-block and current authority reads, and an agreed block hash. Release 28 recognizes the standalone owner model documented in Release 27. A proxy or a new code hash needs an independent model review. NFT balances, minting and the mere presence of an owner selector are insufficient.
4. If eligible, the original gasless claim process issues a bound challenge and checks the actual signer's authority. Signing only submits evidence. The administrator's decision rechecks the project and authority. Publishing a DNS declaration alone gives nobody control of the project.

## Resource limits and diagnostics

Eligibility checks use the existing Worker and D1. Each candidate has one replaceable cache row with a 30-second in-flight lease. Positive discovery results last at most one hour or the shortest observed DNS TTL. DNS publication/model mismatches are cached for an hour, service errors for five minutes. A changed listing binding invalidates the corresponding result. Initial proof, challenge issuance and approval fetch fresh evidence for a dynamically eligible project. Moderated catalog and per-project revisions are checked again in the submission/approval transaction.

The automatic-assessment service has 12 reservations per rolling 24 hours and shares the established site-wide 120 reservation budget. Each probe has two fixed DNS endpoints with a four-second deadline and an 8 KiB response limit, then at most seven reads on each fixed RPC endpoint under a twelve-second deadline. Project-supplied URLs are never fetched. Quota exhaustion keeps manual verification available. A DNS resolver must authenticate the direct TXT answer and agree on the complete declaration. [Google Public DNS JSON API](https://developers.google.com/speed/public-dns/docs/doh/json) · [Cloudflare DNS JSON API](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/make-api-requests/dns-json/)

Isolated tests cover a newly matching listing, duplicate project references, cached and concurrent evaluations, changed domain evidence, provider disagreement, RPC outages, unsigned records, unknown runtimes, quota exhaustion, all 23 baseline outcomes and the Release 27 signature/administrator workflow. New-domain success tests use isolated records and RPC fixtures; existing project eligibility uses the documented independently reviewed production evidence.
