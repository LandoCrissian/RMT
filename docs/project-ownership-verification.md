# Gasless project ownership verification

A verified Google or email member can submit a project ownership claim with their existing Firebase session. Wallet authentication and Firebase custom-token signing are independent of this flow.

Generate a five-minute single-use server challenge bound to the member, browser, origin, purpose, project, claim, chain and canonical contract. Verify the signed message and consume the challenge atomically. A signature proves control of an address. Establish authority over the project separately using a reviewed governance or ownership relationship at a confirmed block, and recheck it before approving the claim. Holding an individual NFT is insufficient. Route unsupported contracts, unclear proxy authority and ambiguous delegation to manual review.

EOA message recovery and supported ERC-1271 checks require no user transaction or gas. Use the existing Worker, D1 and bounded read-only RPC requests. Rate-limit claims and enforce request ceilings before enabling the feature. Release 25 does not enable this claim method.

References: https://eips.ethereum.org/EIPS/eip-4361 and https://eips.ethereum.org/EIPS/eip-1271.
