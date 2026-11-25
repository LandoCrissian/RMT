# LAMMB Vault on RMT

The Vault is linked from the LAMMBs project at `/projects/lammbs`. Its public view is at `/lammb-vault`. The public view distinguishes the observed ERC-2981 setting, imported royalties, and the balances of a configured Robinhood Chain treasury address. An optional read-only mining monitor is available to verified holders and the owner. See [the mining pilot runbook](lammb-mining-pilot.md). No automated on-chain allocation, payouts, or spending are enabled.

## Holder access

The Vault accepts one wallet with at least five LAMMBs Genesis ERC-721 tokens at `0x7a543c61c021e9a5c7949fabdc2f4e0a58088daf` on Robinhood Chain mainnet (4663). RMT account sign-in is not needed for this holder check. The server generates an origin-bound Sign-In with Ethereum message. A nonce can be accepted once within five minutes, and access expires within one hour of issuance. The wallet only signs a message. The two host-only browser/session cookies do not expose keys or signatures to client JavaScript. Server data is always rechecked against a recent block before each gated response. Clearing a session, switching wallets in the client, falling below five, or an RPC outage locks the private ledger. Signing and eligibility are separate from existing RMT project-ownership claims.

The public page contains no private ledger rows or member wallet activity. Browser and session keys are hashed at rest, expired rows are periodically removed on subsequent challenge issuance, and no signature is stored. Browsers with injected EVM support can connect directly. On mobile, open the link inside a compatible wallet's web3 browser. No WalletConnect relay project is configured.

## Owner console and real royalty routing

1. Sign into the canonical RMT owner account, then open `/lammb-vault/manage`.
2. Verify the dedicated wallet address on Robinhood Chain independently before using it. A multisig controlled by the project is preferred. Saving an address in the console publishes that address and reads its ETH, WETH and USDG balances. **It does not modify OpenSea or the NFT contract.**
3. Open [OpenSea Studio Creator Earnings](https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea) as the collection owner. Verify the setting, then publish the approved recipient with the collection-owner wallet as applicable. If the contract's own ERC-2981 recipient also needs changing, inspect the actual collection administration interface before signing. Optional earnings may not be paid by every sale. The public tracking panel never assumes an OpenSea setting from a contract read.
4. Verify a settled real sale before treating new marketplace routing as active. Use the owner console to enter its full transaction hash. It accepts only a finalized single Genesis sale settled by the known Seaport 1.6 contract on Robinhood Chain, where the recipient and amount agree with ERC-2981 before and after the sale block. The receipt must include the NFT transfer, and ERC-20 payments must have a matching WETH or USDG transfer. Unsupported, ambiguous, multi-sale, and duplicate imports are not counted. The console supports passive tracking only.
5. Keep spending and approvals in the treasury wallet. No RMT process can initiate a transaction, enforce the proposed allocations, or distribute proceeds to holders.

The additive Vault migration seeds five independently verified public payments from historical settlements. They are labeled as tracked receipts, not available treasury cash or complete sales history. New receipts are imported by the owner, not automatically discovered. If historical chain state is unavailable, an import remains unverified. The holding gate uses fresh standard RPC reads and the ledger verifier prefers the archive-capable endpoint. No existing RMT tables or application identities are modified.

## Verification

Run `npm run typecheck`, `npm test`, and `npm run build`. The route tests run the real wallet signature verifier against generated keys and a controlled chain source, exercise four vs. five holdings, revocation, expiry, replay, outages, owner-only permissions, exact settlement parsing, and duplicate receipt imports. Check production public snapshot, hidden member ledger and fresh no-transaction wallet proof after deployment. A real qualifying wallet must sign its own message to exercise that account in production.
