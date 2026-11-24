# RMT

**Your ecosystem. All together.**

RMT is an independent discovery and launch hub for community projects, games, music experiences, and creative tools. Its first directory focuses on the Robinhood ecosystem. Users browse project pages, open official destinations, and keep a personal library in their account or on their device.

## Community directory and builder ownership

- Responsive discovery interface, search, category filters, and project destination pages.
- Account library stored in the hosted database and available after sign-in on another device. Guests can save on their current device and explicitly import those favorites when signed in.
- Visible account controls, ChatGPT sign-in, sign-out, and plain-language explanations of where information is saved. No RMT password or wallet connection is required.
- Home-screen web app manifest, icons, and a reconnect page. External games still need their own network connection.
- Seventeen curated, unclaimed project homes, with creator-linked experiences, official artwork, collection groups, and shareable links.
- Builder applications saved to a real database, with pending, changes requested, approved, rejected, and suspended states.
- Owner review queue with required ownership/link checks, revision guards, and recorded decisions.
- Three new applications per account per 24 hours, HTTPS URL validation, duplicate checks, and a form honeypot. Manual review is the publication boundary; these measures do not eliminate every spam account.
- Free listing and claiming, including projects just starting out. No payment prompts or paid placement.
- Expiring ownership challenges through existing official project websites, X profiles, or OpenSea collection descriptions.
- Reviewed owner edit proposals, ownership revocation, immutable audit events, and server-owned publication state.
- Durable email alert queue with a Resend adapter; sending requires a configured recipient, verified sender, and provider credential. Phone and SMS are not launch requirements.
- Authenticated tools for an owner's dot to read new review work and record which notices were acknowledged. Monitoring does not approve projects or change their publication state.

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
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_eager_hulk.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_nosy_tag.sql
```

Do not replay migrations already applied. Hosted deployment applies tracked migrations separately. No request handler creates tables.

## Review workflow

1. A signed-in builder submits a name, short description, stage, category, ownership evidence, and an official website or X profile. A launch destination is optional and falls back to the website or profile.
2. RMT stores the application as pending. It is absent from the public catalog.
3. The reviewer checks official links and verifies that the applicant represents the project. A checkbox records that work; it does not perform it automatically.
4. The reviewer approves, requests changes, or declines with a note. Approval adds the listing to discovery.
5. Requested edits return to review. Applicants cannot silently replace published links. A reviewer can suspend an approved listing.

Admin access requires an exact site-specific user ID in the server environment variable `RMT_ADMIN_USER_IDS`. It fails closed when that variable is empty. Contact information, verification codes, evidence, and review notes do not appear in the public catalog or source repository.

## Claiming and management

A builder opens a project and chooses **Claim this project**, signs in, and chooses one of its existing official channels. RMT creates a random seven-day challenge. The applicant publishes that code through the official channel and submits the proof URL. A reviewer verifies the actual code and authority before approval.

One server-controlled owner assignment can be active for each project. Holding an NFT does not grant control of its directory page. Draft claims do not reserve a project against other applicants, expired challenges cannot be approved, and repeated approvals cannot assign competing owners. Owners can propose changes to descriptions, stages, categories, websites, launch links, X profiles, and experience links. Changes remain private until approved. Collection relationships remain curated; a builder can propose a collection destination as a reviewed link.

## Current scope

The app launches external experiences. Signed-in libraries live in the hosted database; guest libraries stay on the device. Artwork uploads, third-party game hosting, payments, public launch, and custom-domain migration are separate work. The current preview remains owner-private. Before inviting builders, verify the actual site-specific reviewer identity, the chosen notification connection, and the intended public audience. No new token or wallet is required.

See [accounts and saved information](docs/data-storage.md) for the sign-in model, private data boundaries, library limits, and hosting portability. See [notification configuration](docs/notifications.md) for delivery semantics and required server settings.

See [catalog sources and artwork](docs/catalog-sources.md), [deployment](docs/deployment.md), and [release status](docs/release-status.md).
