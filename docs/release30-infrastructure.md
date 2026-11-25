# Release 30 infrastructure acceptance

## Netlify redirect preview

On November 25, 2026, the Release 29 build for commit `fd956fc` generated the redirect successfully. Netlify then stopped publication when its smart scanner matched one string in `lib/firebase-config.ts:5` and `tests/firebase-auth-proxy.test.mjs:135`. The redirect, header and page-change checks all reported the same failed deployment. The browser configuration returned by RMT’s public Firebase initialization endpoint contains that exact value and the expected Firebase project and app IDs. The value’s SHA-256 is `853243614e427ed2d7ed1ced82779163c02c83cbd9954503a4bb31037dbc493c`. Firebase documents this client identifier as public. [Failed deployment](https://app.netlify.com/projects/rmthub/deploys/6b0658bcf5854ef25593640f) · [Firebase API keys](https://firebase.google.com/docs/projects/api-keys)

Release 30 configures Netlify’s exact-value smart-detection exception only for the deploy-preview context. Every file and every other value remains subject to the scanner, including the Firebase configuration and regression tests. A pinned-digest test fails if the exception changes or broadens. The redirect build test checks both generated files and verifies that even a double-slash path stays on the fixed application origin. [Netlify scanner controls](https://docs.netlify.com/build/environment-variables/secrets-controller/)

Preview `6b065c5512740afa3d715c78` at commit `95f9961` successfully scanned **670 files** and processed the redirect. The preview and the existing production Netlify alias each returned 302 on the homepage, a deep APEX link with its query string and `/api/catalog`. All six responses preserved the requested path on the fixed Sites origin. Netlify handles browser redirects. Application code and private endpoints run on Sites. [Successful deploy and scan log](https://app.netlify.com/projects/rmthub/deploys/6b065c5512740afa3d715c78) · [Verified preview](https://deploy-preview-7--rmthub.netlify.app)

## Capacity observations

Measurements below were taken on November 25, 2026, around 03:56–03:58 UTC.

| Service | Observed | Published limit or interpretation |
|---|---|---|
| Sites / Workers | Six ordinary production catalog and guide reads returned HTTP 200 in 218–503 ms. Each returned 24 published projects or five guide lessons. | Cloudflare Workers Free lists 100,000 requests/day and 10 ms CPU per request. Wall-clock latency includes network time. The managed Sites account’s plan, consumed requests and CPU were unavailable. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| D1 | Sites reported 46 live DB tables. The aggregate analytics counter showed 71 of RMT’s 2,000 daily analytics admissions on November 25. | D1 Free lists five million rows read/day, 100,000 rows written/day and 5 GB total storage. Analytics admissions do not measure database operations, index writes or storage. Provider-wide consumption was unavailable. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| R2 | RMT continues using its existing artwork bucket. No account-level R2 metering was available through Sites. | Standard storage includes 10 GB-month, one million Class A operations/month and ten million Class B operations/month. [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Netlify | The authenticated team API reports an existing Personal plan with 1,000 plan credits and no exceeded-usage flags. Its build-status endpoint reported 11 current build minutes, zero queued and zero waiting for concurrency for the November 23–December 23 period. | Netlify’s credit-based Free plan includes 300 credits/month. Deploy previews have no deployment charge. A successful production deployment costs 15 credits on credit-based plans. Build minutes are separate from credit consumption. No remaining-credit figure was available from these endpoints. [Netlify pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) |

The aggregate daily admissions counter had **1,929** slots remaining at the time of inspection. It applies only to RMT analytics. The Sites and Netlify observations do not establish how many additional visitors the application can serve. No infrastructure subscription, billing setting or provider resource was changed.

## Wrangler reload investigation

The historical Linux CI failure on commit `5cc1c6c` was HTTP 500 on a browser document reload at `tests/browser/beginner-guide.mjs:34` while using `wrangler dev --local`. Windows diagnostics also recorded a local process exit code 1 and intermittent connection refusal during reload testing. Neither provides a provider quota-exhaustion code or identifies the precise internal cause of the development proxy failure. [Failed Linux run](https://github.com/LandoCrissian/RMT/actions/runs/45538067174)

The existing harness on commit `332978c` exercises the actual Worker bundle with Miniflare directly. It continues testing request routing, D1 and browser reloads. Release 29’s Linux job passed this path in WebKit and Chromium. Six additional public GET samples passed during this investigation. The separate Release 27 observation was one local Miniflare D1 internal error. These incidents provide no evidence for a paid upgrade. [Direct Worker harness](https://github.com/LandoCrissian/RMT/commit/332978cf2344182d347f1af83f26e0ec3919ab83) · [Passing Linux run](https://github.com/LandoCrissian/RMT/actions/runs/45542022965) · [Earlier D1 investigation](release28-analytics.md)

