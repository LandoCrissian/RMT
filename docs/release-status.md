# RMT v0.3 — accounts, personal libraries, and review monitoring

## This release

- A dedicated account page, visible sign-in controls, sign-out, an account reference, and explanations of what RMT saves.
- Signed-in libraries stored in the hosted database and guest favorites stored in the current browser. Device favorites enter an account only through an explicit import.
- A personal launchpad with direct launch links, loading and retry states, and clear account/device storage labels.
- A 200-project account-library limit enforced atomically. Server identity scopes every library operation. An expected-account check prevents a stale tab from writing to a different signed-in account.
- A stateless Site MCP connection for the owner's dot: read authenticated identity, read new review work, and acknowledge specific notices without changing review decisions.
- Per-reviewer, per-revision monitor receipts, so repeated checks need not repeat the same notice and resubmissions can produce a new notice.
- Email-only alert intents. Phone setup and SMS delivery are disabled; historical SMS records are preserved but never retried.
- Additive migration `0003_nosy_tag.sql` for saved projects and monitor receipts. Existing migrations are unchanged.

## Preserved

The directory retains all seventeen sourced project homes, original project artwork, grouped collections, official destinations, search, category filters, shareable project/claim pages, and responsive navigation. Listings and ownership claims remain free. New projects can use an official website or X profile without a minted collection or finished app.

Applications, ownership challenges, and listing edits stay private until an authorized reviewer acts. Claim approval still requires checking the proof on an existing official channel. Notification acknowledgement never substitutes for review.

## Runtime activation

The preview remains owner-private. The owner-selected email recipient is stored as a runtime secret, separate from source and browser code. Sending email also needs a verified sender, Resend credential, and configured reviewer identity; recipient configuration alone does not prove delivery.

The published MCP capability provisions the Site's private connection. Installation, authenticated connection, reviewer authorization, and a monitoring schedule are separate states. Verify the actual site-specific account reference through the identity tool or account page before configuring `RMT_ADMIN_USER_IDS`. Hosting sharing IDs and recipient addresses are not substitutes. Exercise the digest and acknowledgement through the connected tools before creating unattended monitoring. See [owner alerts](notifications.md).

Public access and `rmtlaunch.fun` routing require a deliberate launch decision. This release does not publish an X announcement or contact project teams.

## Verification and practical limits

The integrated test suite uses actual SQL operations with every tracked migration. Coverage includes library persistence after reopening, account isolation, stale account guards, concurrent quota enforcement, approved-only saving, ownership-review races, revision checks, notification deduplication, monitor authorization, receipt persistence, and disabled SMS delivery. Provider HTTP responses are simulated; tests do not establish live inbox delivery.

The release workflow checks TypeScript, all tests, a production build, and desktop/phone interaction. Live owner authentication and notification delivery are verified separately when their connections are available.

- The directory launches external experiences. RMT does not host their game files, music, accounts, progress, or wallet operations.
- Library updates are server-confirmed; an ambiguous interrupted save requires a refresh. This release does not promise offline cloud writes or instant synchronization between already-open tabs on different devices.
- Private account APIs are not cached by the service worker. Guest favorites can disappear when browser data is cleared.
- Review lists cap at 200, owned applications at 100, the community catalog at 500, and each monitor digest at 50 new records. Add pagination before these directory/review limits are reached. Monitoring can consume another batch after acknowledging the previous one.
- Email work runs after a pending write or reviewer retry; a dot digest does not flush the email queue.
- Backup/export and account-deletion workflows are not implemented. GitHub preserves source and migration definitions, not private database rows. See [data storage](data-storage.md).
