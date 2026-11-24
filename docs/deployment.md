# Deployment and ownership

## Current hosting

The tracked source repository is `https://github.com/LandoCrissian/RMT`. A separate Sites source remote supports the complete app at `https://rmt-hub.wise-elf-8473.chatgpt.site`. The app remains owner-private; publishing a source update does not change its audience or the repository's visibility.

The app is packaged as a Cloudflare Worker through Vinext. `.openai/hosting.json` identifies the preview and declares D1 binding `DB`. Runtime secrets must not be committed or included in browser bundles.

The v0.5 source adds richer project showcases, versioned RMT app icons, and per-project social metadata and artwork. These changes retain the existing Sites Worker, D1 database, ChatGPT identity integration, and owner-private audience. The preceding v0.4 deployment established runtime environment revision 3; a source update does not itself alter runtime secrets or audience settings.

The GitHub-connected Netlify project at `https://rmthub.netlify.app` has deployed successfully as a static redirect entrypoint. Its build runs `node scripts/build-netlify-entry.mjs` and publishes only `dist/netlify-entry`. Live checks confirmed the native `302` preserves paths and queries; browser navigation also preserved `#review`. The complete app, D1 data, and ChatGPT authentication remain on Sites. This entrypoint does not proxy authenticated requests or host a copy of the backend. Application releases require Sites publication as well as the GitHub source update. See [Netlify entrypoint](netlify-entry.md) for configuration and deployment checks.

## Administrator setup

The verified site-specific owner identity is configured in runtime secrets and active in the published deployment. The authenticated identity tool returned `isReviewer: true`, and a live reviewer-only digest read succeeded with zero pending items. Keep the actual identity out of source and release notes. The following procedure applies when setting up or changing a reviewer:

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

Both custom-domain bindings and TLS are active. On November 24, 2026, the owner supplied an iPhone screenshot showing the expected **Log in to access / Continue with ChatGPT** screen after visiting `rmtlaunch.fun`. This verifies that the custom domain reaches the Sites sign-in gate on that device. The gate is consistent with the current owner-private audience; the screenshot does not verify completion of sign-in or the account, saved-library, and reviewer flows on that host.

Earlier requests from the development environment returned HTTP 403 **Site Unavailable** with `x-openai-site-blocked: true`, while the platform URL returned the expected HTTP 401 sign-in response. The owner's screenshot supplies useful external evidence that the custom domain is reachable; it does not establish the cause of the environment-specific restriction. Do not change DNS or remove authentication in response to that development-environment result alone.

Keep `RMT_PUBLIC_URL` set to the working platform URL until the custom domain serves the app and sign-in, saved libraries, and reviewer access have been verified. A valid certificate alone does not establish application readiness.

### Activation checks

- [x] Publish v0.4 and runtime environment revision 3 to Sites.
- [x] Confirm the authenticated owner's reviewer authorization and live digest read.
- [x] Verify the Netlify redirect, including path, query, and browser fragment retention.
- [x] Observe the expected Sites sign-in screen on the owner's iPhone at `rmtlaunch.fun`.
- [ ] Verify completed sign-in and the app, session, library, and review pages through the custom domain; also verify the `www` name.
- [ ] Observe a real review alert and acknowledgement; the initial digest contained no pending work.
- [ ] Confirm the intended audience before inviting builders. The current app remains owner-private.
- [ ] Change `RMT_PUBLIC_URL` only after the preferred domain passes its application checks.

## Project links and social previews

The v0.5 showcase routes use `https://rmtlaunch.fun/projects/{slug}` as their canonical share URLs. A direct request to a project path supplies its title, description, canonical URL, Open Graph image, and large-image Twitter/X card metadata. Legacy `/#project/{id}` links remain supported for browser navigation. The share images are versioned local JPEG assets built from the catalog's existing project artwork; newly approved projects without reviewed artwork use an RMT fallback.

Canonical public share URLs and the private notification setting serve different purposes. `RMT_PUBLIC_URL` remains the verified platform URL for review notifications until the custom domain passes the signed-in application checks above. Using `rmtlaunch.fun` in canonical share metadata does not change that runtime setting or verify that social crawlers can reach it.

The current owner-private Sites audience intercepts anonymous project-page and image requests with the sign-in gate. X previews require an owner-authorized change to a supported public audience, followed by successful anonymous access to the actual HTML and image URLs. The application continues to protect account records, project applications, claims, edits, and reviewer operations with server-side identity and authorization checks. A public catalog does not make those private records public.

Do not describe the on-site card preview or metadata checks as successful X-side rendering. After any audience change, verify anonymous HTML/image responses and private API rejection, then inspect a user-operated X composer preview. No post is published automatically. See [project sharing](social-sharing.md) for image generation, approved-catalog handling, cache-versioning, and verification details.

## Service worker

Only an offline reconnect page is cached. APIs, authentication responses, project pages, social images, and private application records are not cached by the service worker. The v0.5 branding uses new icon filenames in the app metadata and manifest; the offline cache version changes with its updated page. Existing installed shortcuts may retain their previous icon until the browser updates the installed app or the shortcut is added again.

Guest favorites use localStorage. Signed-in favorites are stored in D1, keyed by the authenticated site-specific user ID. Importing guest favorites into an account requires an explicit action; signing in does not silently merge another person's device library.

## Review alerts

`RMT_PUBLIC_URL` points to the current private preview. The owner's chosen email recipient is stored as a runtime secret. Email delivery is not configured: a verified sender and provider credentials are still required. Phone and SMS are not part of the current launch.

The Site's MCP capability exposes an authenticated identity tool and reviewer-only review-monitor tools. Reviewer authorization and a live digest read are verified. An hourly RMT review-alert schedule is enabled with timezone `America/Denver`. The first digest returned zero pending items, so real alert delivery and a live acknowledgement have not yet been observed. A schedule being enabled does not establish delivery. Never derive administrator identity from the notification email or hosting account ID.

See [notification setup](notifications.md) for exact server variables, provider acceptance semantics, and retry limitations. Secrets and private recipient values belong in the hosting runtime, not GitHub or browser code.
