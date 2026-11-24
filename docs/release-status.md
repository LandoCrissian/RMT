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

The app remains owner-private. The complete app, D1 database, and ChatGPT authentication run on Sites. The Netlify release contains only a redirect entrypoint and still needs live deployment verification. The working platform URL remains the canonical `RMT_PUBLIC_URL`.

The custom-domain DNS records now point `rmtlaunch.fun` and `www.rmtlaunch.fun` to Sites. TLS is active, but the current application response is HTTP 403 **Site Unavailable**, so custom-domain access is not yet verified. Vercel nameservers and domain registration are unchanged. The previous Netlify app is untouched; retaining its old DNS target under `previous-launchpad` is not a verified website backup. See [deployment status](deployment.md).

The authenticated connection established the owner's exact site-specific identity, and the reviewer secret has been configured. The next Sites deployment must apply it before live reviewer authorization can be confirmed. No private identity or notification recipient belongs in source.

The owner-selected email recipient is stored as a runtime secret. Sending still requires a verified sender and provider credential, and live delivery has not been established. Monitoring is not enabled: verify reviewer authorization, digest reads, and acknowledgements after deployment before configuring unattended checks. See [owner alerts](notifications.md).

Public access requires a deliberate audience change after activation checks. This release does not publish an X announcement or contact project teams.

## Verification and practical limits

The integrated test suite uses actual SQL operations with every tracked migration. Coverage includes library persistence after reopening, account isolation, stale account guards, concurrent quota enforcement, approved-only saving, ownership-review races, revision checks, notification deduplication, monitor authorization, receipt persistence, and disabled SMS delivery. Provider HTTP responses are simulated; tests do not establish live inbox delivery.

The Netlify configuration passed validation against its official JSON schema. Local entrypoint checks confirmed an isolated two-file output, removal of stale output, a forced temporary redirect, and fallback preservation of path, query, and fragment with a fixed destination host. Live Netlify redirect checks remain part of deployment verification.

Before marking this release active, complete TypeScript checks, all tests, a production build, and desktop/phone interaction checks for search, card taps, links, and copy fallback. Also verify the deployed reviewer configuration, custom-domain application access, and the chosen notification connection. These checks are separate from DNS propagation and certificate issuance.

- The directory launches external experiences. RMT does not host their game files, music, accounts, progress, or wallet operations.
- Library updates are server-confirmed; an ambiguous interrupted save requires a refresh. This release does not promise offline cloud writes or instant synchronization between already-open tabs on different devices.
- Private account APIs are not cached by the service worker. Guest favorites can disappear when browser data is cleared.
- Review lists cap at 200, owned applications at 100, the community catalog at 500, and each monitor digest at 50 new records. Add pagination before these directory/review limits are reached. Monitoring can consume another batch after acknowledging the previous one.
- Email work runs after a pending write or reviewer retry; a dot digest does not flush the email queue.
- Backup/export and account-deletion workflows are not implemented. GitHub preserves source and migration definitions, not private database rows. See [data storage](data-storage.md).
