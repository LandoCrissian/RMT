# Project enrichment

Every public showcase resolves its presentation from the approved catalog on read. An approved owner’s description and meaningful link labels take precedence. The resolver then uses reviewed evidence from the official website, official X profile, OpenSea collection and contract explorer, in that order. An explicit Control Center presentation override sets the final display value. Clearing the override restores automatic selection.

The resolver considers only current approved destinations and collection/profile identities. It derives labels for generic links from their role, composes section text from the available experiences, and uses the listing category and chain to clarify the category. Approved listing artwork and project colors carry forward. If a community listing has no distinctive approved color, its category supplies a color. A project with a single X profile can use the existing link and summary immediately. It does not acquire a website, contract or experiences by inference.

## Editing a showcase

In **Control Center → Projects**, select a listing and choose **Edit presentation**. The editor shows the automatic description, destination labels and their sources. Choose a listed image or upload approved square or landscape artwork, then assign it to the hero or an individual destination. Save with a review reason. The card controls publish a project-specific composition or the RMT fallback. **Reset all to automatic** restores the current source-derived settings. Each save checks the listing revision and is recorded in administration history.

## Refreshing source evidence

The read-only **Review published project sources** GitHub workflow runs weekly or on manual dispatch. It discovers public projects through RMT's catalog. The collector checks website metadata at approved first-party destinations and reads public metadata from the approved X profile. It accepts a profile bio as a candidate only if its page title contains the same handle. It also looks up published OpenSea collections and supported Blockscout token addresses. It skips unavailable or oversized responses, bounds the number of pages and rotates batches for larger catalogs. The task never accesses a project owner's private submission or an X timeline.

The workflow produces a review artifact for changed suggestions. To preview a release locally, run `node scripts/collect-project-evidence.mjs source-review.json`; append one or more published project IDs to narrow the refresh. Review each proposed field against the linked official document. Generic titles, stale counts, campaign language and unverified release claims should be omitted. Merge the accepted records into `lib/reviewed-source-metadata.json` and run the normal tested release. An artifact is a candidate and cannot publish site data. `lib/enrichment-sources.json` contains source-attributed editorial summaries when official metadata requires interpretation. Images must already have passed the existing artwork or source review.

## Release 22 research

| Project | Automatically collected and reviewed | Source-grounded editorial selection |
| --- | --- | --- |
| MoneyMomos | Official destination descriptions for the Elite Compound, MomoWallet and Swagshop, plus the published X identity. | Five generated ranks and the 100 hand-drawn Elites, the SteamVille introduction and distinct descriptions for the Council, Jail and Academy. [SteamVille](https://moneymomos.com/) |
| WIF Outlaws | The published X identity. | The official site repeats its homepage metadata on the guide route. Its rendered guide provides the project-specific description of agent wallets, permissions and spending limits. [Outlaws & agents](https://www.robinwifhat.com/agents) |
| Bored Traders | The Art page's description of the 10,000-piece art sequence and the published X identity. | The Terminal, portrait collection and whitepaper introductions. The art count describes the gallery, not the number of NFTs minted. [The Art](https://boredtrader.co/art) · [Whitepaper](https://boredtrader.co/whitepaper) |

All three approved X profiles returned a public bio. The release uses each profile identity and the more specific first-party website descriptions. Existing collection logos, banners, destination images and curated accents are attributed in [catalog sources](catalog-sources.md#release-21-directory-sources). The three projects had no approved owner-supplied presentation override at release preparation.
