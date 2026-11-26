# LAMMB mining pilot and go/no-go

**Scope:** LAMMBs only. No factory, new token, custom custody contract, holder returns, automatic split, or automatic spend. No allocation percentages are approved. RMT is a monitor and accounting view, not the signing wallet, mining host, or pool.

## Proven components

- **Robinhood Chain treasury:** Use a dedicated Safe smart account on mainnet (chain ID 4663), which already supports Safe. Use an owner-approved signer set and threshold, with independently controlled keys and a recovery plan. A 2-of-3 layout is a starting point only if three independent keys and secure backups are available. Confirm the actual deployed Safe, owners and threshold before registering it in RMT. Do not use the Safe factory or singleton as the payout address. [Safe's Robinhood Chain deployment](https://www.safe.global/blog/what-protocols-check-before-deploying-on-your-chain) · [Safe owner and threshold management](https://help.safe.global/articles/9629761095)
- **BTC payout:** Create a separate, project-controlled Bitcoin mainnet receiving address and verify it in the wallet before entering it in the pool. Never send Bitcoin mining payouts to the Robinhood Chain Safe. Keep separate records for royalty assets and mined BTC.
- **Monitoring:** For a host that can send hashrate to a customer-owned pool account, create a *dedicated* LAMMB Braiins Pool account and a new read-only access profile. Configure `RMT_LAMMB_BRAIINS_ACCOUNT` and `RMT_LAMMB_BRAIINS_READ_TOKEN` as private hosting runtime values, never as browser-exposed variables. The site pulls the documented profile endpoint and checks the returned account identity. It surfaces aggregate one-hour and 24-hour hashrate, healthy worker count and cumulative pool reward to the owner and verified 5+ holders. It does not retrieve or mutate payout settings, pass through private account data, or treat pool credits as on-chain earnings. Confirm a payout separately against the destination wallet and pool payout history. [Braiins monitoring](https://academy.braiins.com/braiins-pool/monitoring) · [Braiins payout rules and fees](https://academy.braiins.com/braiins-pool/rewards-and-payouts)

## First real test without redirecting royalties

**Use a capped standard spot bid in Braiins Hashpower, going to the dedicated LAMMB Braiins Pool account.** This rents existing SHA-256 compute. It does not buy an ASIC, lock in a hosting term, or enter a solo-mining bet. The vendor documents a **10,000-sat** minimum budget with a speed limit, **1 PH/s** minimum speed, and a **0% spot fee in beta**. The live account, terms, fees and funding/withdrawal amounts must be verified before the owner sends BTC. The minimum order budget is not the total cost, a funding minimum, or a fill guarantee. Do not use unlimited speed or Quick Solo. [Market limits and fees](https://academy.braiins.com/braiins-hashpower/faqs/basics) · [Bid setup](https://academy.braiins.com/braiins-hashpower/trading)

1. In Braiins Pool, set up the dedicated account and a project-controlled BTC payout wallet. For a small pilot, review Lightning payout support and minimums in the live account. The pool documents a 10,000-sat on-chain payout fee below 0.005 BTC, so a small successful pilot may show credited rewards before an on-chain payout makes sense.
2. In Braiins Hashpower, verify account eligibility and the complete BTC amount before funding. Create a **standard spot bid** with a capped speed and budget, the regular pooled Braiins Stratum endpoint (the preset or `stratum+tcp://stratum.braiins.com:3333`), and your dedicated pool worker name `YOUR_ACCOUNT.lammb-pilot`. The owner sets the price cap and signs any funding transaction. Budget only for validation and don't fund a balance you would be uncomfortable leaving with the vendor. [Braiins funding and account requirements](https://academy.braiins.com/braiins-hashpower/faqs/account)
3. Look for an accepted worker share, followed by nonzero measured hashrate in the dedicated pool account. Connect the read-only access profile to RMT and compare the displayed stats to the pool dashboard. Verify the first actual withdrawal or payout independently before marking the payout path complete. Neither an accepted bid nor a pool credit proves receipt in a wallet.
4. Separately, verify that the project's Safe can receive the intended royalty assets before the collection owner signs the new recipient in OpenSea Studio. Check the on-chain royalty setting separately and verify an ordinary settled sale for the first creator fee. No artificial test sale or royalty reroute is needed to test mining. [OpenSea creator earnings](https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea)

For hardware ownership later, Compass documents customer-owned Braiins pool connections, but get an all-in written quote first. Simple Mining's advertised free trial was accepting applications when checked, but its live qualification says applicants should be ready to invest at least $10,000 within 90 days, so it is not the proposed small pilot. [Compass pool configuration](https://support.compassmining.io/hc/en-us/articles/4446509937821-Mining-pool-configuration) · [Simple Mining trial qualification](https://www.simplemining.io/hosting/free-trial)

## Illustrative economics, checked November 25, 2026

The observed Braiins order book showed available capacity at 0.47116 BTC/EH/day. At that reference price a 10,000-sat budget would buy about 5.1 hours of delivery at a full 1 PH/s, before any transfer costs and assuming a fill at that price. Treat this as a snapshot, not an executable quote or a profit expectation. [Live market](https://hashpower.braiins.com/)

For a Bitmain Antminer S21 Pro (234 TH/s, 3.510 kW), a hashprice of $27.54 per PH/s per day, and continuous operation for 30 days:

| Line | Estimate |
|---|---:|
| Gross mining revenue | $193.33 |
| After Braiins standard 2.5% pool fee | $188.50 |
| Power at publicly advertised single-unit starter tier of $0.08/kWh | $202.18 |
| Operating result before hardware, deposit, repairs, taxes or payout fees | −$13.68 |
| Approximate operating break-even electricity price before those costs | $0.0746/kWh |

This is a screening benchmark, not a quote, profit projection, or purchase recommendation. The input snapshot is volatile and should be refreshed on the day of any decision. The pilot choice is based on visibility and bounded cost, not a claim that mining is profitable. [Bitmain specification](https://support.bitmain.com/hc/en-us/articles/31321354157593-S21-Pro-Specification) · [November 25 hashprice](https://www.simplemining.io/hashprice) · [Starter hosting tier](https://www.simplemining.io/hosting)

Keep the Vault status unconfigured until the dedicated pool profile is connected. It is appropriate to report an observation only after the provider confirms it. A dashboard, public pool endpoint, and a provider's advertised trial do not prove a LAMMB worker is online.
