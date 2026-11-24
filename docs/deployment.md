# Deployment and ownership

## Current preview

The tracked source repository is `https://github.com/LandoCrissian/RMT`. A separate Sites source remote supports the owner-private preview. Publication does not change the repository's visibility or the existing rmtlaunch.fun website.

The app is packaged as a Cloudflare Worker through Vinext. `.openai/hosting.json` identifies the preview and declares D1 binding `DB`. Runtime secrets must not be committed or included in browser bundles.

## Administrator setup

1. Visit the private preview while signed in as its owner.
2. Open `/#review` and copy **Your account reference** (also available as `userId` from `/api/session`).
3. Configure that exact value as `RMT_ADMIN_USER_IDS` in the server runtime, then deploy the saved source version.
4. Verify the review queue is available to that identity and blocked to anonymous and non-reviewer identities.

Site account IDs from sharing settings are not a substitute for the site-specific identity header. The application never creates an administrator from the first visitor or a client-side setting.

## Authentication portability

The current auth adapter trusts identity supplied by the Sites gateway. Do not expose the Worker directly or move it to a different host without replacing that adapter with verified server-side sessions. On another host, browsers must not be able to invent `oai-authenticated-*` headers and become users.

D1's underlying data is SQLite. The query/review logic is separated from the UI and tested through a SQLite adapter. Moving hosting requires a database adapter, an authenticated-session adapter, migration execution, and the usual environment configuration; it is not only a DNS change.

## Custom domain

`rmtlaunch.fun` remains a separate production destination. Domain transfer or routing changes are not part of this preview build. Before replacing its current app: check the existing DNS and hosting, pick the production authentication model, verify public submissions and reviewer access, and retain a rollback target. A hosting change does not necessarily require transferring domain registration.

## Service worker

Only an offline reconnect page is cached. APIs, authentication responses, and private application records are not cached by the service worker. A personal library uses localStorage and is intentionally device-local in this first release.

## Review alerts

`RMT_PUBLIC_URL` points to the current private preview. Configure reviewer access and the owner email/phone plus provider credentials before expecting live alerts. See [notification setup](notifications.md) for exact server variables, provider acceptance semantics, and retry limitations. Secrets and private recipient values belong in the hosting runtime, not GitHub or browser code.
