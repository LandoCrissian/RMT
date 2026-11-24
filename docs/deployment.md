# Deployment and ownership

## Current hosting

The tracked source repository is `https://github.com/LandoCrissian/RMT`. A separate Sites source remote supports the complete app at `https://rmt-hub.wise-elf-8473.chatgpt.site`. The app remains owner-private; publishing a source update does not change its audience or the repository's visibility.

The app is packaged as a Cloudflare Worker through Vinext. `.openai/hosting.json` identifies the preview and declares D1 binding `DB`. Runtime secrets must not be committed or included in browser bundles.

The v0.4 configuration makes the GitHub-connected Netlify project at `https://rmthub.netlify.app` serve a static redirect entrypoint. Its build runs `node scripts/build-netlify-entry.mjs` and publishes only `dist/netlify-entry`; the live redirect still needs verification after deployment. The complete app, D1 data, and ChatGPT authentication remain on Sites. This entrypoint does not proxy authenticated requests or host a copy of the backend. See [Netlify entrypoint](netlify-entry.md) for configuration and live-deploy checks.

## Administrator setup

The verified site-specific owner identity has been configured in runtime secrets. That configuration still needs the next Sites deployment and a live reviewer-access check; it is not yet an activation claim. Keep the actual identity out of source and release notes.

1. Visit the private preview while signed in as its owner.
2. Open `/#review` and copy **Your account reference** (also available as `userId` from `/api/session`).
3. Configure that exact value as `RMT_ADMIN_USER_IDS` in the server runtime, then deploy the saved source version.
4. Verify the review queue is available to that identity and blocked to anonymous and non-reviewer identities.

Site account IDs from sharing settings are not a substitute for the site-specific identity header. The application never creates an administrator from the first visitor or a client-side setting.

## Authentication portability

The current auth adapter trusts identity supplied by the Sites gateway. Do not expose the Worker directly or move it to a different host without replacing that adapter with verified server-side sessions. On another host, browsers must not be able to invent `oai-authenticated-*` headers and become users.

D1's underlying data is SQLite. The query/review logic is separated from the UI and tested through a SQLite adapter. Moving hosting requires a database adapter, an authenticated-session adapter, migration execution, and the usual environment configuration; it is not only a DNS change.

## Custom domain

Domain routing now points directly to the Sites custom-domain service, preserving the app's existing authentication and database. Domain registration and the Vercel nameservers are unchanged.

| Name | Type | Destination |
| --- | --- | --- |
| `rmtlaunch.fun` | A | `162.159.143.30` |
| `rmtlaunch.fun` | A | `172.66.3.26` |
| `www.rmtlaunch.fun` | CNAME | `custom-domains.chatgpt.site` |

The former apex Netlify ALIAS was renamed `previous-launchpad` to retain a reference to its previous target. This DNS reference is not a verified website backup. The old Netlify application is untouched; no private database was moved or restored as part of this routing change.

TLS is active for the custom domains, but the latest application check returned HTTP 403 **Site Unavailable**. Domain activation is under investigation. Keep `RMT_PUBLIC_URL` set to the working platform URL until the custom domain serves the app and sign-in, saved libraries, and reviewer access have been verified. A valid certificate alone does not establish application readiness.

### Activation checks

- Deploy the saved application source and pending runtime configuration to Sites.
- Confirm owner sign-in and reviewer authorization, including denial for anonymous and non-reviewer identities.
- Verify the app, session, library, and review pages through both custom-domain names.
- Verify the Netlify build returns its expected redirect to the working app, including a link with a query and fragment.
- Confirm the intended audience before inviting builders. The current app remains owner-private.
- Change `RMT_PUBLIC_URL` only after the preferred domain passes these application checks.

## Service worker

Only an offline reconnect page is cached. APIs, authentication responses, and private application records are not cached by the service worker. Guest favorites use localStorage. Signed-in favorites are stored in D1, keyed by the authenticated site-specific user ID. Importing guest favorites into an account requires an explicit action; signing in does not silently merge another person's device library.

## Review alerts

`RMT_PUBLIC_URL` points to the current private preview. The owner's chosen email recipient is stored as a runtime secret. Email delivery still requires reviewer access, a verified sender, and provider credentials. Phone and SMS are not part of the current launch.

The Site's MCP capability exposes an authenticated identity tool and reviewer-only review-monitor tools. The authenticated identity tool has established the owner's site-specific account reference. Reviewer authorization, digest reads, and acknowledgements still need verification after deployment before enabling a recurring monitor; monitoring is not enabled yet. A published endpoint alone does not prove that a connection is fully configured. Never derive administrator identity from the notification email or hosting account ID.

See [notification setup](notifications.md) for exact server variables, provider acceptance semantics, and retry limitations. Secrets and private recipient values belong in the hosting runtime, not GitHub or browser code.
