# Release 27 contract authority evidence

The initial reviewed registry enables Bored Traders only. Its project-controlled [whitepaper](https://boredtrader.co/whitepaper) publishes the Robinhood Chain NFT deployment in its application data under `nft`. This matches the independent [Release 21 catalog record](catalog-sources.md) and its [collection contract](https://robinhoodchain.blockscout.com/token/0x0c036d11be6b5839cfe2bfe5c4c6e3854193d959). Claimants cannot set the target.

| Read | Observed value |
| --- | --- |
| Chain | Robinhood Chain mainnet, 4663 |
| Target | `0x0c036d11be6b5839cfe2bfe5c4c6e3854193d959` |
| Runtime Keccak-256 | `0x0771fda08e5d6dc90b951db0a736e5abcc6b5be5ae3c9c21bf363c18aa4990eb` |
| Block number and timestamp | 122675803, 2026-11-25 01:33:34 UTC |
| Block hash | `0x6ee9c3c9b0231047d05b5a41d7892c3325d2b840fa050fd041bcf1dcace8aaf5` |
| Collection owner at that block | `0xb07edb5e0cd18607c4d4911b675b85b8d70b4d75` |

The public Robinhood RPC and Pinax RPC independently returned the same block hash, code and owner. Reproduce with `eth_getBlockByNumber`, `eth_getCode` and `eth_call` of `0x8da5cb5b` at block `0x74fe25b` on providers retaining that history. At a fresh block, owner may differ. See [official network documentation](https://docs.robinhood.com/chain/connecting/).

The pinned runtime's `owner()` dispatcher jumps to PC `0x061e` and reads the low 160 bits of storage slot 8. The standard two-step ownership transfer entry at `0x076c` reaches the authorization check at `0x17af`, which compares the caller to the same slot before the pending owner can be set. The accept-ownership entry compares the caller to slot 9, then replaces the owner. Disassembly of the executable runtime, excluding Solidity metadata and PUSH operands, contained no DELEGATECALL, CALLCODE or SELFDESTRUCT instructions. This evidence establishes collection administration. Reviewers still establish the human claimant's relationship to the project.

MoneyMomos and WIF Outlaws both returned 45-byte minimal-proxy runtimes delegating to `0x09a26fc8fcef18192e267d7a6da9dfb4be81dd6a`. Neither a working owner selector nor an individual collectible grants eligibility. Those projects and all projects without an independently reviewed binding retain manual claims.

The claim verifier compares two fixed public read endpoints, requires an agreed block 20 blocks below the lower fresh tip, checks the owner at that block and at each provider's tip, and rechecks the block hash. For [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) it also verifies acceptance of the exact challenge digest and rejection of the same signature over a different digest. Review reruns the checks before approval. Each verification has a 12-second deadline, no RPC retries and a hard limit of 12 requests per provider. Public RPC availability can vary. An unavailable provider leaves the claim unresolved.

The dedicated chain tests use ephemeral signatures and synthetic RPC responses. They cover EOA and ERC-1271 success, authority transfer, altered message, incorrect contract, stale or divergent providers, interrupted canonicality, changed bytecode, provider rate limits and a permissive ERC-1271 implementation. No production ownership claim or physical wallet signature was used as evidence.

## Operational limits and review

A rolling 24-hour window permits 12 verifications per account and 120 across the site. Both initial submissions and administrator rechecks reserve a slot before contacting either provider. At 24 calls per slot, the maximum is 2,880 RPC requests per rolling day. Each member can request 12 challenges per day, with a site-wide ceiling of 500. Existing claim creation limits also apply. The existing Control Center claim-intake switch pauses new challenges and submissions.

Wallet proof creates a pending claim. A separate owner or administrator reviews the project relationship and triggers a fresh chain check. The private audit records the submission, block evidence, check outcomes and final decision. The database guard prevents a previous website version from approving a pending wallet claim without the matching current review record. An application rollback should retain the additive schema and its guard. Existing manual claims keep their original verification method.
