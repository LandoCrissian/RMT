# RMT

**Your ecosystem. All together.**

RMT is an independent discovery and launch hub for community projects, games, music experiences, and creative tools. Its first directory focuses on the Robinhood ecosystem. Users browse project pages, open official destinations, and save a personal library on their device.

## First build

- Responsive discovery interface, search, category filters, and project destination pages.
- Device-local saved library; no wallet is required to browse.
- Home-screen web app manifest, icons, and a reconnect page. External games still need their own network connection.
- Three curated, unclaimed seed listings: LAMMBs, VAMPS, and Suited Apes Society.
- Builder applications saved to a real database, with pending, changes requested, approved, rejected, and suspended states.
- Owner review queue with required ownership/link checks, revision guards, and recorded decisions.
- Three new applications per account per 24 hours, HTTPS URL validation, duplicate checks, and a form honeypot. Manual review is the publication boundary; these measures do not eliminate every spam account.
- A planned optional $5 / seven-day Spotlight concept. Checkout and paid placement are **not enabled**.

The preview starts owner-private. The GitHub repository is public. Curated listings are not partnerships, endorsements, ownership claims, or smart-contract audits.

## Development

Requires Node.js 24 for the test suite (the framework supports Node >=22.13) and npm.

```sh
npm run install:ci
npm run typecheck
npm test
npm run build
npm run dev
```

The app uses React, TypeScript, the Next-compatible Vinext runtime, and a Cloudflare Worker. Structured data lives in D1 (SQLite). Hosting-specific authentication is isolated in `lib/server/auth.ts` and `lib/server/runtime.ts`. Dependencies are locked.

For this environment, Sites provides the authenticated gateway and provisions D1 from `.openai/hosting.json`. Read [deployment notes](docs/deployment.md) before moving to a different host. A raw Worker that trusts visitor-supplied identity headers is **not** a supported deployment.

### Local database

After the first build, apply pending SQL migrations in order to the local database. Example:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slimy_crystal.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_chief_impossible_man.sql
```

Do not replay migrations already applied. Hosted deployment applies tracked migrations separately. No request handler creates tables.

## Review workflow

1. A signed-in builder submits a name, short description, official website, launch destination, X profile, and ownership evidence.
2. RMT stores the application as pending. It is absent from the public catalog.
3. The reviewer checks official links and verifies that the applicant represents the project. A checkbox records that work; it does not perform it automatically.
4. The reviewer approves, requests changes, or declines with a note. Approval adds the listing to discovery.
5. Requested edits return to review. Applicants cannot silently replace published links. A reviewer can suspend an approved listing.

Admin access requires an exact site-specific user ID in the server environment variable `RMT_ADMIN_USER_IDS`. It fails closed when that variable is empty. Contact information, verification codes, evidence, and review notes do not appear in the public catalog or source repository.

## Current scope

The first build launches external experiences; it does not host or execute third-party games. Cloud-synced libraries, self-service claims for curated listings, image uploads, payments, public launch, and a custom-domain migration are separate release work. No new token, marketplace, NFT mint, or custodial wallet is included.

See [catalog sources and artwork](docs/catalog-sources.md), [deployment](docs/deployment.md), and [release status](docs/release-status.md).
