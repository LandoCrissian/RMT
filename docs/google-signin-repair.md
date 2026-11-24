# Google sign-in state recovery

## Report and scope

On November 24, 2026 the owner supplied an iPhone screenshot of Firebase's
"Unable to process request due to missing initial state" page after choosing
Google sign-in. Release 9 used `signInWithPopup`, not `signInWithRedirect`.
The screenshot proves lost helper state; it does not alone prove which browser
storage restriction caused the loss.

This repair keeps the dedicated `rmt-launch-auth-20261124` Firebase project,
existing user IDs, token verification, session cookies, account links, reviewer
allowlist, database, artwork storage, and free application/claim flow.
There is no data migration or new paid service.

## Same-origin helper

On each of the following HTTPS origins, browser Firebase configuration uses
that same hostname as `authDomain`:

| Application origin | Google callback |
| --- | --- |
| `https://rmtlaunch.fun` | `https://rmtlaunch.fun/__/auth/handler` |
| `https://www.rmtlaunch.fun` | `https://www.rmtlaunch.fun/__/auth/handler` |
| `https://rmt-hub.wise-elf-8473.chatgpt.site` | `https://rmt-hub.wise-elf-8473.chatgpt.site/__/auth/handler` |

The Worker transparently proxies the documented helper documents/scripts to
the original Firebase project's helper. It does not issue an HTTP redirect to
Firebase. It allows only fixed helper paths and GET/HEAD/POST, bounds POST
bodies, strips application cookies/identity headers, and never caches or logs
OAuth callback contents. Unknown helper paths and unsupported methods fail
closed. `/__/firebase/init.json` serves the existing public web configuration
locally; no Firebase Hosting deployment is required.

Only exact approved origins receive the same-origin configuration. Unknown
hosts, development previews, HTTP origins and lookalike domains retain the
original Firebase helper and popup-only behavior. The service worker explicitly
excludes auth helper/callback and API paths from offline interception.

## Browser flow

- Phones and iPad desktop mode use same-tab Google sign-in on approved origins.
- Desktop popup sign-in still starts directly on the click's call stack.
- Blocked popups or lost-state errors offer an explicit same-tab retry. User
  cancellation never silently starts another flow.
- `getRedirectResult` is consumed once per page. Its errors remain visible in
  Account. Successful Firebase credentials use the existing same-origin server
  session exchange.
- Existing validated claim/project/Studio/library continuation URLs remain in
  the sign-in page URL. A verified account gets its existing Continue action.
- Session writes stay ordered. Duplicate token exchanges share a pending
  request, and queued/delayed tokens belonging to a prior user are skipped.
- Known unsupported embedded browsers get practical guidance; ordinary Safari
  is not classified as an unsupported WebView. Email/password sign-in remains
  available for any email provider. No privacy-setting changes are requested.

## Provider configuration evidence

The existing Firebase CLI provisioning configuration already contained all
three application origins. The official provisioning API's
`GoogleSigninProviderConfig.oauthRedirectUris` contract automatically appends
`/__/auth/handler` when no path is supplied. `firebase.json` now records those
full callback paths explicitly while retaining the old entries for rollback.

On November 24, public Firebase project configuration confirmed the three
authorized domains. Anonymous `accounts:createAuthUri` probes for the three
exact callback URLs returned the existing Google OAuth client. Browser checks
then reached Google's normal RMT sign-in form for all three callbacks without
`redirect_uri_mismatch`. No user credentials were entered, no consent was
submitted, and no Firebase provider configuration was changed.

## Verification boundary and rollback

Automated coverage includes helper routing and credential stripping, exact
origin selection, mobile/desktop selection, single redirect consumption,
visible callback/session failures, delayed-account races, and the existing
claim/review/library and server authorization regressions. Live upstream helper
documents and scripts returned success with uncompressed content. Final build
and browser results are recorded in release status.

A normal Google login form verifies callback acceptance and the outbound
handoff. It does not prove completion of Google consent, return to RMT with a
verified account, or the owner's physical iPhone behavior. Those checks must
be reported separately; do not describe Chrome layout checks as Safari tests.

The prior known deployment is Sites version 9, source commit
`81821b92c5889f7ff57f189430c3515490088190`. Roll back through that saved version
if this repair causes a verified production regression. No schema rollback is
needed, and the original Firebase callback remains authorized. Do not change
DNS or remove authentication to work around an environment-specific domain
access denial.

## Primary references

- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/configure-providers-cli
- https://firebase.googleapis.com/$discovery/rest?version=v1alpha
- https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/createAuthUri
- https://developers.google.com/identity/gsi/web/guides/supported-browsers
