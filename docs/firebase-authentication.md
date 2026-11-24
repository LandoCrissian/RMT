# Firebase authentication and account migration

## Google sign-in repair

The November 24 Google helper-state repair is documented in
[Google sign-in recovery](google-signin-repair.md). Approved production origins
use their own Firebase helper routes, with same-tab mobile sign-in and explicit
callback completion. Existing project/account identities and server access
controls remain unchanged. The earlier release checks below are historical;
they did not establish a completed Google sign-in on the owner's iPhone.

RMT uses the new dedicated Firebase project `rmt-launch-auth-20261124` (RMT Authentication), created using the Firebase CLI account `launchrmt@gmail.com`. Web app ID: `1:719694340242:web:399b13786cf403b3be064b`. No pre-existing Firebase project, database, domain, or billing plan was modified. `firebase.json` deploys only Google and email/password authentication. Any valid email provider is accepted; registration and listings remain free.

## Identity and data

The public Firebase web config is in `lib/firebase-config.ts`; it is not a server credential. The server checks RS256 signatures against Google's rotating Secure Token keys, exact issuer and project audience, expiration, issued-at, subject and authentication time. It checks account status and revocation through Firebase before accepting authenticated requests. Identity is never taken from client role claims or an email allowlist.

The browser exchanges Firebase ID tokens through a same-origin JSON endpoint for an expiring Secure, HttpOnly, SameSite=Lax `__Host-rmt-session` cookie. The SDK refreshes the session while the app is open and after focus. Sign-out clears the cookie and suppresses ambient legacy browser identity. Requests deduplicate verification only within one Request object. CSRF checks remain required on every mutation.

Unverified email accounts can browse and verify their address, but cannot save account libraries, submit, claim, edit, or review. Email verification and password recovery use Firebase's hosted email action handler. Google users use Firebase's verified email state. A password is never sent to the RMT backend or stored in D1.

Original database records retain their user IDs. Migration `0004_productive_skreet.sql` adds only `account_links`; it rewrites no records. Firebase IDs are namespaced as `firebase:<uid>`. Linked accounts resolve to their original user ID, preserving libraries, claims, submissions, ownership, audit events, and the exact administrator allowlist. Existing dot tools and authenticated Sites reviewer identity remain supported.

## Owner account correction (November 24, 2026)

The owner chose the existing verified RMT Launch Firebase account as the
independent administrator identity. Its exact `firebase:<uid>` is configured in
the server-only `RMT_ADMIN_USER_IDS` secret after checking the verified live
member record. The personal Sites account is removed from that owner allowlist.
No role is inferred from an email address and no account records are merged.

The existing Dot identity is separately configured in
`RMT_REVIEW_MONITOR_USER_IDS` for MCP review digest and alert acknowledgement
operations only. It cannot enter the Control Center or approve projects.

The current sign-in email and method are visible only in the private Account
panel. Sign out before choosing the intended Google account. Google sign-in
requests explicit account selection. The same sign-out control also ends a
legacy RMT session by suppressing the ambient Sites identity.
A runtime-protected Firebase owner is refused legacy linking because changing
its canonical ID would remove its exact-ID owner authorization.

## Optional legacy account linking

The following flow remains available for eligible ordinary accounts that need
their old RMT records. It is not required for the independent Firebase owner.

1. Open `/#account`, sign in with the intended Google account (or create and verify an email account). A legacy signed-in owner can still see the Firebase sign-in form.
2. In **Bring over an existing RMT account**, choose **Verify original account** and complete the existing Sites sign-in. This is a one-time proof for old accounts, not a requirement for new members.
3. Sign in freshly to Firebase if more than five minutes have passed, then choose **Link verified accounts**. Linking requires both the Sites-authenticated original identity and a fresh, verified Firebase token on the same same-origin request. Email matching alone never links accounts or grants administrator access.
4. Confirm the inherited library and any previously authorized workspaces. Linking does not independently grant a new role.

Each Firebase UID and original ID can be linked once. An attempted conflicting link is refused. A new Firebase account with saved activity cannot be linked automatically because silently switching its record namespace would hide that activity; contact the owner for an explicit data-combination procedure. Existing records are never deleted by linking.

## Verification

Before publication: typecheck, build, 86 automated tests, live disposable Firebase registration/password login/deletion, mobile browser sign-in and sign-out, unverified claim rejection, anonymous administrator rejection, Google popup handoff, recovery form availability, 320/390/768/1440 layouts, independent bookmarks and full-card navigation. All 17 project HTML/image routes were checked locally for project-specific large-image X metadata. All existing claim/review/library and dot contract tests pass.

Owner interaction remains necessary to complete Google account consent, actual email verification/recovery links, and the owner's production account link. Automated tests verify dual-proof linking and preservation of old reviewer/library identity. They do not prove receipt of emails or a completed owner Google login. X-side composer rendering requires a user-operated preview; metadata and anonymous image checks alone do not establish it.

Deployment keeps `.openai/hosting.json` project ID, DB binding, domain settings, runtime secrets, and monitoring schedule. Sites applies the additive migration before uploading the Worker. Netlify remains a redirect only. Do not deploy Firebase Hosting or move D1 for this change.
