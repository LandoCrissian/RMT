# Firebase authentication and UI refinement — deployed

November 24, 2026: Sites version 7 deployed successfully at https://rmtlaunch.fun (platform URL https://rmt-hub.wise-elf-8473.chatgpt.site), runtime environment revision 3. Deployed source commit: `66d471b30eb8e44b75538201bf7a47b6704cf261`, pushed to both the retained Sites source and GitHub main. Deployment `appgdep_6b05a9726a188191afaa76d1c6c6d36d` succeeded. No DNS or existing runtime-secret changes were made.

- Created a new Firebase project under launchrmt@gmail.com; Google and email/password provider deployment succeeded. Existing Firebase projects were not reused.
- Added verified Firebase sessions, verification/recovery UI, and dual-proof account linking with a schema-only additive D1 migration. Original record IDs and reviewer allowlist are retained.
- Standardized uncropped directory artwork, shortened mobile cards, removed redundant card corner arrows, and retained whole-card navigation with independent bookmarks.
- Typecheck, build, and all 86 automated tests passed, including existing library, claims, reviews, notifications, and dot contracts.
- Responsive browser checks passed at 320, 390, 768, and 1440 pixels, with consistent artwork heights and no horizontal overflow. Bookmark clicks did not open project dialogs; card clicks did.
- Disposable live Firebase accounts passed registration, password login, browser session establishment, sign-out, and cleanup in local and production checks. Unverified claims returned 403; signed-out claims and administrator APIs returned 401. No test verification/recovery messages were sent.
- Production root, session, and catalog returned 200 anonymously. www session returned 200. All 17 production project pages contained their own large-image X metadata and their image URLs returned success.
- After deployment, the connected dot identity still reported reviewer access and the review digest succeeded with no pending items. Existing hourly monitoring was preserved.

Remaining owner checks: complete actual Google consent/sign-in, verify email and recovery delivery through the intended inbox, link the intended owner Firebase account using the existing owner session, and inspect a user-operated X composer preview. Owner linking cannot be completed from CLI account access alone. Existing administrator access remains active while this step is pending. No paid service or billing upgrade was introduced.

The sections below describe the preceding release.

# RMT v0.5 — project showcases, sharing, and identity

## Release content

- Cinematic project homes with organized experiences, community links, and collections.
- Full-screen phone layout, clear launch/save/share controls, related-project discovery, and client navigation titles.
- Clean `/projects/{slug}` URLs, backward-compatible legacy links, and server-generated canonical/Open Graph/Twitter metadata.
- Individual 1200 × 630 JPEG share cards for all 17 curated projects; RMT fallback for new projects without reviewed artwork.
- Updated RMT monogram, versioned PWA/Apple/browser icons, and a refreshed offline reconnect page.
- Public showcases use the approved catalog projection. Private proof, contact data, account IDs, and review notes remain excluded.

## Validation

Typecheck, all **83 automated tests**, and the production build passed. New tests exercise individual metadata, image dimensions/format/size, URL encoding, fallback behavior, and pending → approved → suspended showcase visibility using real SQLite migrations.

Browser checks confirmed the VAMPS direct route and metadata, project-specific artwork, related-project navigation and Back, unavailable-project/noindex rendering, a 390px phone-width showcase without horizontal overflow, 16px search text, `sui ` returning Suited Apes, and a tap on the card body opening that project. The copy control reached its success state and share/composer destinations were checked. Physical iPhone focus zoom, the native phone share sheet, and actual X card rendering were not tested.

## Publication boundary

The source update preserves the existing owner-private Sites audience. Public social previews additionally require an owner-authorized public audience and anonymous access to both HTML and image assets. No X post was sent. The owner's screenshot verifies that `rmtlaunch.fun` reaches the expected private login screen on an iPhone; completed signed-in custom-domain flows remain unverified.

See [deployment](deployment.md), [sharing](social-sharing.md), and [brand assets](brand.md) for operational details.

---

# RMT v0.4 — navigation, mobile search, and hosting entrypoints

## Source changes

- Whole project cards open their project home, with separate bookmark and direct-launch controls. Keyboard users retain native button behavior and visible focus.
- Primary destination links open in the top-level tab. Explicit **New tab** and **Copy** controls are available for project destinations, collections, and library launches.
- A manual-copy dialog shows a selectable URL when clipboard access is blocked. Embedded previews offer a direct **Open RMT** link.
- Search matches normalized words across project names, identifiers, initials, collections, experiences, and URLs. Result counts show the active scope, and **Search all projects** retains the query while leaving a category or saved-library filter.
- Search and form controls use 16px text to address phone focus zoom without disabling pinch zoom. Clear-search and link controls have larger tap targets.
- A dedicated Netlify build generates a two-file redirect entrypoint to the working Sites app. It avoids treating the Vinext Worker output as a standalone Next.js deployment.
- Deployment notes separate DNS/TLS setup from authenticated application readiness. No database migration or payment feature is introduced by this release.

## Preserved

The directory retains all seventeen sourced project homes, original project artwork, grouped collections, official destinations, search, category filters, shareable project/claim pages, and responsive navigation. Listings and ownership claims remain free. New projects can use an official website or X profile without a minted collection or finished app.

The account page, ChatGPT sign-in, database-backed libraries, explicit guest-favorite import, account-isolation guards, and 200-project library limit remain in place. The existing monitor receipts and email alert queue are preserved. Phone and SMS remain disabled, and previously applied migrations are unchanged.

Applications, ownership challenges, and listing edits stay private until an authorized reviewer acts. Claim approval still requires checking the proof on an existing official channel. Notification acknowledgement never substitutes for review.

## Runtime activation

The v0.4 app is published on Sites with runtime environment revision 3 and remains owner-private. The complete app, D1 database, and ChatGPT authentication run on Sites. The GitHub-connected Netlify deployment is ready and serves only the redirect entrypoint. Live checks confirmed its `302` preserves paths and queries, and browser navigation preserved `#review`. The working platform URL remains the canonical `RMT_PUBLIC_URL`.

The custom-domain DNS records point `rmtlaunch.fun` and `www.rmtlaunch.fun` to Sites, and both bindings and TLS are active. Checks from this environment return HTTP 403 **Site Unavailable** with `x-openai-site-blocked: true`, identifying a platform/network block rather than an RMT application error. Its exact source—this environment or the Sites access layer—is unresolved. The platform URL returns the expected HTTP 401 sign-in response to an unauthenticated check. Custom-domain access for users is not yet verified. Vercel nameservers and domain registration are unchanged. The previous Netlify app is untouched; retaining its old DNS target under `previous-launchpad` is not a verified website backup. See [deployment status](deployment.md).

The reviewer secret is active. The authenticated identity tool returned `isReviewer: true`, and a reviewer-only digest read succeeded with zero pending items. No private identity or notification recipient belongs in source.

Hourly RMT review monitoring is enabled with schedule timezone `America/Denver`. No pending work was available, so no real alert delivery or live acknowledgement has yet been observed. The owner-selected email recipient is stored as a runtime secret, but email delivery remains unconfigured without a verified sender and provider credential. See [owner alerts](notifications.md).

Public access requires a deliberate audience change after activation checks. This release does not publish an X announcement or contact project teams.

## Verification and practical limits

The integrated test suite uses actual SQL operations with every tracked migration. Coverage includes library persistence after reopening, account isolation, stale account guards, concurrent quota enforcement, approved-only saving, ownership-review races, revision checks, notification deduplication, monitor authorization, receipt persistence, and disabled SMS delivery. Provider HTTP responses are simulated; tests do not establish live inbox delivery.

TypeScript checks, all 77 tests, and a production build passed. Desktop and narrow embedded-browser checks passed for search, whole-card activation, independent Save controls, 16px form controls, and absence of horizontal overflow. The narrow check used a 390px frame with 375px of content width.

RMT links actually opened the PixelHood Arcade OpenSea collection and the Suited Jungle Tree destination, including navigation out of an embedded frame. Clipboard copying also succeeded in the browser. The denied-clipboard condition could not be forced during browser verification; its manual fallback and timeout are implemented, but that live failure path is not claimed as tested. Physical iPhone focus-zoom behavior has not been verified.

The Netlify configuration passed validation against its official JSON schema. Local entrypoint checks confirmed an isolated two-file output, removal of stale output, a forced temporary redirect, and fallback preservation of path, query, and fragment with a fixed destination host. Its live deployment and redirect were then verified. Custom-domain user access and actual alert delivery remain separate outstanding checks.

- The directory launches external experiences. RMT does not host their game files, music, accounts, progress, or wallet operations.
- Library updates are server-confirmed; an ambiguous interrupted save requires a refresh. This release does not promise offline cloud writes or instant synchronization between already-open tabs on different devices.
- Private account APIs are not cached by the service worker. Guest favorites can disappear when browser data is cleared.
- Review lists cap at 200, owned applications at 100, the community catalog at 500, and each monitor digest at 50 new records. Add pagination before these directory/review limits are reached. Monitoring can consume another batch after acknowledging the previous one.
- Email work runs after a pending write or reviewer retry; a dot digest does not flush the email queue.
- Backup/export and account-deletion workflows are not implemented. GitHub preserves source and migration definitions, not private database rows. See [data storage](data-storage.md).
