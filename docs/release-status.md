# RMT v0.2 — directory and builder ownership

## Implemented

- Seventeen sourced project homes: the original three plus all fourteen supplied collections.
- Official project artwork, direct launch buttons, copy/share links, same-tab launch fallback, and creator-confirmed collection groups.
- Alphabetical discovery, search across projects/experiences/collections, category filters, saved library, responsive navigation, and project dialogs.
- Shareable project and ownership-claim routes that survive reload and sign-in.
- Free applications and claims. The initial paid Spotlight concept and all payment prompts have been removed.
- New projects can use an official website or X profile and choose Starting out, Building, or Live. A minted collection or finished app is not required.
- Seven-day proof challenges using existing official website, X, or OpenSea creator channels, followed by manual owner review.
- One authoritative project manager, private proof records, ownership revocation, and reviewed content changes.
- Server-side submission limits, duplicate prevention, same-origin mutation checks, revision guards, and recorded review decisions.
- Durable email/SMS alert intents with Resend and Twilio adapters, a reviewer delivery-status screen, and bounded retries.
- Original migrations preserved; the new tables and stage field are in `0002_eager_hulk.sql`.

## Activation still required

The deployment remains owner-private. Its public review URL is configured, but live reviewer identity has not been established. Configure the site-specific account reference as `RMT_ADMIN_USER_IDS` after the owner signs in. The authenticated review-access screen provides a copyable reference; account IDs from hosting sharing settings are not substitutes.

Email and SMS require the owner's chosen recipients, sender identities, and provider credentials. No recipients or provider secrets were guessed. No live message was sent. The Notifications screen distinguishes missing configuration, pending work, provider acceptance, rejection, and uncertain outcomes. Provider acceptance is not proof of delivery to a handset or inbox.

## Before inviting builders on X

1. Connect and verify the owner's reviewer identity.
2. Configure email/text delivery if alerts are required at launch.
3. Choose and open the intended Site audience. The current private preview cannot accept public builders.
4. Keep the existing domain unchanged until its hosting and sign-in migration is deliberately handled.

A public campaign, messages to project teams, and changes to `rmtlaunch.fun` are outside this update.

## Current limits

- The directory launches external experiences; their gameplay, wallet operations, and rewards are not audited by RMT.
- Collection relationships remain curated. Confirmed builders can propose additional collection URLs as reviewed destination links.
- No uploaded artwork/game hosting, payments, wallet custody, new token, cloud-synced favorites, or mobile push notifications.
- Review queues show at most 200 recent/priority records, owned applications at most 100, and the public community catalog at most 500. Add pagination before reaching those limits.
- There is no background alert scheduler. Pending-write requests and the reviewer retry action process a small batch. Delivery failures never roll back a saved application.

## Verification

The current integrated test suite runs the actual data/review logic with in-memory SQLite and every tracked migration. All 51 tests pass. It covers competing ownership approvals, expired proof, private-field exclusion, stale edits, ownership revocation, distinct collection identities, transactional notification deduplication, provider failures and uncertain SMS outcomes. Provider HTTP calls in tests are mocked; live delivery is not claimed.

TypeScript, production build, and responsive browser interaction checks are completed as part of the release workflow. The final delivery identifies the actual published preview and repository state. Live owner authentication and actual email/SMS receipt remain unverified until configuration is supplied.
