# Project updates — release 11

This release adds an owner-managed announcement workflow to RMT. It is prepared
against release 10. Production publication is held while the owner completes the
physical-phone Google sign-in check agreed in the release plan. Saving a version
or opening the pull request does not publish it or apply its database migration.

## Builder experience

In **Builder Studio → My projects**, a confirmed project manager can choose
**Post an update**. Announcements, build updates, and releases share one editor:

- A headline of up to 100 characters and plain-text body of up to 2,400 characters.
- An optional labeled public HTTPS destination, such as a playable release.
- A preview, explicit private draft saves, and submission for RMT review.
- A history of drafts, pending reviews, published updates, requested changes, and archives.

Drafts can be unfinished; submission requires a headline of at least five
characters and a body of at least twenty. A destination needs both a label and a
valid public HTTPS URL. Save confirmations occur only after a valid server
response. An uncertain network result requires refreshing the saved state before
retrying, avoiding accidental duplicate drafts or repeated publishing actions.

An owner can revise a draft or rejected update, withdraw a pending update, or
archive a saved draft or published update. Published text cannot be edited in
place. A published or archived update can be copied into a new draft and reviewed
again. Archiving retains history and removes a publication from the public page.

Existing project-detail editing adds **Beta** alongside Starting out, In
development, and Live. A release announcement does not change the project stage
automatically. Curated projects with no confirmed stage keep that field unset.

## Public showcase

Project pages have **Overview** and **Updates** tabs. Existing games, official
destinations, collections, artwork, and sharing controls stay available in
Overview. The updates tab has a direct address, `/projects/{slug}#updates`, which
also survives a supported sign-in continuation.

Approved updates appear newest first, six per page. Previous/next controls keep
the history bounded rather than continuously adding rows. Long bodies have a
read-more control. Loading, an empty history, and a failed request are separate
states. Switching projects cancels the prior request and starts a fresh view;
returning focus rechecks current visibility. There are no fabricated project
announcements or seeded production posts.

## Reviewer experience and notifications

The review workspace distinguishes **Listing edits** from **Project updates**.
Reviewers can inspect the announcement and its actual destination, approve it,
request changes with a note, or archive a published copy with a note. Owners see
the review feedback privately.

Submitting an update creates an `update` event in the existing durable outbox
and review-monitor digest. Draft saves do not notify reviewers. The existing Dot
schedule and reviewer allowlist are unchanged. Receipt acknowledgements remain
separate from approval and match an exact pending revision. No new message was
sent and no email-provider delivery is claimed by this release.

## Storage and access

`project_updates` stores content, its publisher and ownership revision, status,
content revision, and publication timestamps. `project_update_events` records
each successful transition. All mutation guards execute inside the database
write or atomic batch, including ownership, project visibility, content revision,
quota, and one-pending-update-per-project constraints.

Private routes reuse verified RMT identities. The `X-RMT-Account` request header
checks that a page still belongs to the currently signed-in account; it never
grants authentication. Reviewer routes additionally require the existing server
allowlist. Client workspaces remount across identity changes, abort stale loads,
and suppress late mutations and follow-on submissions from an old account.

Public queries require approved status, a currently public project, and the
original publisher's current matching ownership revision. Revoking ownership,
suspending a community listing, or archiving the update removes it from subsequent
public reads. Public DTOs include only project and announcement fields, never
account IDs, review notes, private drafts, or audit records. Responses are
`no-store`; the service worker does not cache API responses.

Reviewers do not receive private drafts. Previously submitted content withdrawn
for private editing also stays private, including after it is archived.

### Limits

| Limit | Value |
| --- | --- |
| New drafts per account in 24 hours | 10 |
| Currently manageable open drafts per account | 20 |
| Review submissions per account in 24 hours | 5 |
| Pending updates per project | 1 |
| Public page size | 6 default, 12 maximum |
| Owner/reviewer page size | 50 default, 100 maximum |

Old drafts tied to revoked management access do not permanently consume the open
draft allowance. Cursor pagination is ordered by timestamp and ID to handle ties.

## API

| Route | Methods | Scope |
| --- | --- | --- |
| `/api/project-updates` | GET, POST | Owner list and draft creation |
| `/api/project-updates/{id}` | PATCH | Save, submit, withdraw, archive |
| `/api/projects/{projectId}/updates` | GET | Public approved updates |
| `/api/admin/project-updates` | GET | Reviewer queue |
| `/api/admin/project-updates/{id}` | POST | Approve, reject, archive |

## Database migration and rollback

`0006_lowly_moonstone.sql` is a forward migration. Historical migrations are
unchanged. It creates the update tables and expands the notification kind
constraint using a replacement outbox table with the same columns and indexes.
Existing outbox values are copied verbatim; application data and authentication
records are not rewritten. No production migration is applied during preparation.

The upgrade test creates the deployed schema through migration 0005, seeds all
historical outbox states and representative accounts, libraries, claims,
applications, artwork, edits, and receipts, applies only 0006, and compares all
preexisting records. It also verifies database integrity, constraints, and indexes.

Release 10 remains the application rollback target. A code rollback does not
reverse a database migration or delete update history. The new schema retains
the older application's columns and permits its existing notification kinds.
After a production rollback, restore the current application before processing
any new `update` notifications; the older notification formatter does not know
that new kind. Do not run a destructive down-migration to remove announcements.

## Verification boundary

The full automated suite covers existing authentication, account linking,
library, claims, artwork, discovery, sharing, notifications, and the new update
lifecycle. New cases include persistence across reopening, simultaneous
submissions, stale approvals, interleaved ownership revocation and suspension,
quotas without partial audit/outbox writes, privacy, pagination, and route guards.

Browser validation uses the managed preview. Signed-in owner/reviewer UI is
exercised with clearly labeled, isolated sample data that intercepts requests;
it is not a completed production Firebase login or a real project announcement.
Those fixtures are excluded from source and removed before production packaging.
The real public preview API is checked separately against the local migrated DB.
Exact check results and saved-version status are recorded in the release report.

The ecosystem-wide activity feed, following, screenshot/trailer galleries,
roadmap milestones, analytics, and push notifications are later increments.
RMT's installable web app and saved libraries already existed before this release.
