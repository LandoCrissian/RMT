# RMT

**Your ecosystem. All together.**

RMT is an independent discovery and launch hub for community projects, games, music experiences, and creative tools. Its first directory focuses on the Robinhood ecosystem. Users browse project pages, open official destinations, and keep a personal library in their account or on their device.

## Community directory and builder ownership

- Responsive discovery interface, category filters, and project destination pages. Whole project cards open their project home while bookmark and launch actions remain independent.
- Search across project names, initials, collections, experiences, and website addresses, with normalized spacing and punctuation, visible result counts, and an option to search beyond the current category or library.
- Readable phone form controls, direct destination links, explicit new-tab/copy options, and a selectable-link fallback when the browser blocks clipboard access.
- Account library stored in the hosted database and available after sign-in on another device. Guests can save on their current device and explicitly import those favorites when signed in.
- Google and email/password sign-in, email verification, password recovery, and sign-out. Any valid email provider is supported. No ChatGPT account or wallet is required for ordinary users.
- Home-screen web app manifest, icons, and a reconnect page. External games still need their own network connection.
- Seventeen curated, unclaimed project homes, with creator-linked experiences, official artwork, collection groups, and shareable links.
- Builder applications saved to a real database, with pending, changes requested, approved, rejected, and suspended states.
- Owner review queue with required ownership/link checks, revision guards, and recorded decisions.
- Three new applications per account per 24 hours, HTTPS URL validation, duplicate checks, and a form honeypot. Manual review is the publication boundary; these measures do not eliminate every spam account.
- Free listing and claiming, including projects just starting out. No payment prompts or paid placement.
- Expiring ownership challenges through existing official project websites, X profiles, or OpenSea collection descriptions.
- Reviewed owner edit proposals, ownership revocation, immutable audit events, and server-owned publication state.
- Free logo and banner uploads for confirmed managers, private previews, and reviewer approval before publication. Approved banners supply project-specific Open Graph and X images; curated projects also have versioned share cards.
- Durable email alert queue with a Resend adapter; sending requires a configured recipient, verified sender, and provider credential. Phone and SMS are not launch requirements.
- Authenticated tools for an owner's dot to read new review work and record which notices were acknowledged. Monitoring does not approve projects or change their publication state.

The current Site audience is public. The GitHub repository is public. Curated listings are not partnerships, endorsements, ownership claims, or smart-contract audits.

## Development

Requires Node.js >=24.12 and npm.

```sh
npm run install:ci
npm run typecheck
npm test
npm run build
npm run dev
```

The app uses React, TypeScript, the Next-compatible Vinext runtime, and a Cloudflare Worker. Structured data lives in D1 (SQLite); reviewed project artwork is stored privately in R2 and served through application authorization checks. Authentication is isolated in `lib/server/auth.ts`, `lib/server/firebase-auth.ts`, and `lib/server/runtime.ts`. Dependencies are locked.

For this environment, Sites provides the legacy reviewer gateway; Firebase supplies ordinary user accounts. Sites provisions the D1 `DB` and R2 `BUCKET` bindings declared in `.openai/hosting.json`. Read [deployment notes](docs/deployment.md) before moving to a different host. A raw Worker that trusts visitor-supplied identity headers is **not** a supported deployment.

### Hosting

The complete app is published at `https://rmtlaunch.fun`, with its existing D1 database. The platform URL remains `https://rmt-hub.wise-elf-8473.chatgpt.site`. The GitHub-connected Netlify project at `https://rmthub.netlify.app` is deployed as a small redirect entrypoint to that app. Its live redirect preserves paths and queries, and browser navigation preserves fragments. Netlify does not run a second backend. See [Netlify entrypoint](docs/netlify-entry.md) for the build command and publish directory.

`rmtlaunch.fun` and `www.rmtlaunch.fun` have active Sites domain bindings and TLS. Anonymous requests to the public session endpoint return 200 on both names. No DNS or hosting migration is part of the Firebase change. See [Firebase authentication](docs/firebase-authentication.md) for project details, secure account linking, and owner activation checks.

### Local database

After the first build, apply pending SQL migrations in order to the local database. Example:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slimy_crystal.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_chief_impossible_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_eager_hulk.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_nosy_tag.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_productive_skreet.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0005_aromatic_dracula.sql
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

One server-controlled owner assignment can be active for each project. Holding an NFT does not grant control of its directory page. Draft claims do not reserve a project against other applicants, expired challenges cannot be approved, and repeated approvals cannot assign competing owners. Owners can propose changes to descriptions, stages, categories, websites, launch links, X profiles, experience links, logos, and banners. Changes remain private until approved. Collection relationships remain curated; a builder can propose a collection destination as a reviewed link.

### Project artwork and sharing

Confirmed managers with a verified account can choose a static PNG, JPEG, or WebP logo or banner in **Builder Studio → My projects → Edit project**. Images are limited to 2 MiB each, with up to eight uploads per account in a rolling 24-hour window. The uploader prepares a validated PNG, saves a private preview, and includes the selected image in the manager’s edit proposal. A reviewer checks the proposed artwork and links before approving the update.

Approved logos appear with the project name. An approved banner becomes its project cover and the image referenced by its Open Graph and X metadata. Projects without an approved banner use their curated share card or the RMT fallback. The current curated cards are versioned at `/social/{slug}-v2.jpg`; wide source artwork is preserved in a separate panoramic layout. Replaced or removed uploaded images stop being available at their old public URLs.

See [reviewed project artwork](docs/project-artwork.md) for validation, storage and ownership rules, and [project sharing](docs/social-sharing.md) for metadata, image selection and verification limits.

## Current scope

The app launches external experiences and supports reviewed project artwork. Signed-in libraries live in the hosted database; guest libraries stay on the device. Third-party game hosting and payments remain outside the current release. Public browsing requires no account; Google or email/password accounts support saved libraries, applications, claims, and project management. No new token, wallet, or ChatGPT account is required for ordinary users.

Reviewer authentication and digest reads have been verified, and hourly review monitoring is enabled using the `America/Denver` schedule timezone. No pending work was available to verify a real alert and acknowledgement; email delivery is not configured. Production owner account linking, an actual owner upload/review cycle, email delivery checks, and X composer previews remain separate activation checks. Automated tests and on-site previews do not establish those live outcomes.

See [accounts and saved information](docs/data-storage.md) for the sign-in model, private data boundaries, library limits, and hosting portability. See [notification configuration](docs/notifications.md) for delivery semantics and required server settings.

See [catalog sources and artwork](docs/catalog-sources.md), [deployment](docs/deployment.md), and [release status](docs/release-status.md).
