# RMT Control Center

## Operating the site

An authorized owner, administrator, or moderator opens `/#control` from the main
menu or **My account → Your Control Center**. It uses the existing verified RMT
identity. Google and email/password sign-in, secure account linking, and public
browsing remain in place. The protected owner remains the exact identity in
server configuration, never the first visitor or an email/name supplied by a
client. An unlinked Google account must use the existing account-link flow to
join its owner identity; matching an email is not an administrator grant.

The workspace contains real, bounded, searchable data:

- **Overview:** known members, observed member activity, public projects,
  confirmed builders, public profiles, and the four pending review queues.
- **People:** names, private account email, observed providers, known historical
  activity, first/last observed visit, projects, and reversible access suspension.
- **Projects:** create listings; edit names, descriptions, stages and destinations;
  preview changes; choose featured projects; hide, archive and restore; transfer
  or revoke management using an exact known account and checked ownership.
- **Artwork:** upload an administrator logo/banner privately, preview it, then
  explicitly save the selection. Administrator artwork has an explicit override
  and reset operation; it does not impersonate the project's builder.
- **Reviews:** the existing applications, ownership, listing-edit and update
  review workspaces remain available.
- **Content:** hide or restore published profiles and project announcements.
  Unpublished member profile content is not exposed for moderation.
- **Insights:** anonymous browser sessions, project views and outbound actions,
  shown as daily aggregates with a seven- or thirty-day window.
- **Appearance:** a site announcement with optional HTTPS link, maintenance
  mode, and independent application/claim/update-submission switches.
- **Team access:** owner-controlled administrator and moderator grants.
- **History:** old review histories and new administrative audit events.
- **System:** live database read, configuration and recorded-image totals,
  existing notification status/retry, and paginated JSON/CSV operational exports.

## Roles and changes

The runtime owner has all capabilities and cannot be removed or suspended from
the dashboard. Administrators manage projects, members, content, settings,
exports and reviews. Moderators have overview, review and content capabilities.
Only the protected owner assigns administrator or moderator roles. Members have
no control APIs. An administrator cannot suspend themselves or an owner.

New private management APIs require a verified current identity, a matching
`X-RMT-Account`, and the appropriate current server capability. Writes require
same-origin JSON, expected revisions, a meaningful reason and an atomic audit
record. Sensitive UI actions have explicit confirmation. SQL rechecks delegated
role revision and account status within the mutation transaction. The existing
review mutations and monitor acknowledgement also use this transaction guard.
New review clients supply an account expectation; older already-open reviewer
tabs remain compatible, with the same role and record-revision protection.

No operation permanently deletes a member or project. Hiding, archiving and
suspension preserve records. Suspension blocks authenticated application
operations and removes the member's public profile, builder links and updates.
It does not delete the Firebase login or automatically revoke project ownership;
project visibility and ownership are separate decisions in Projects.

Ownership transfer requires an active canonical known member, explicit ownership
confirmation and the current ownership revision. A transfer advances ownership
revision so former-manager drafts and published updates cannot retain authority.
Account linking rechecks role, suspension and source activity atomically so it
cannot be used to escape a suspension or orphan managed records.

## Publication and recovery

Public catalog, project pages, Activity, profiles and managed artwork honor
project/content controls. Public HTML and APIs do not retain a stale cached
publication after moderation. An administrator text edit invalidates pending
builder edits based on the older listing. A subsequently reviewed builder edit
can supersede the administrator text. Administrator artwork has a separate
explicit override/reset policy explained in its editor.

Maintenance mode defaults off. Normal site activity continues during development
and deployment. When deliberately enabled later, maintenance pauses public
experiences and non-administrator API operations. The homepage account entry,
authentication helpers, session, site settings, Control Center, review APIs and
authorized monitor remain reachable. The owner can turn maintenance off from a
phone. Individual intake switches pause submissions while retaining saved work;
update drafts can still be edited when only update submission is paused.

Control Center edits survive ordinary browsing within the Hub. Switching an
internal management section with unsaved edits prompts first. Uncertain network
save outcomes require reconciliation before repeating a mutation. Account or
permission changes clear private data rather than presenting old authority.

## What the numbers mean

Before this release, RMT did not keep a complete sign-in ledger. The migration
recovers known identities from existing project, library, profile and account-link
records. Historical first/last sign-in and verification dates remain unknown.
Users who authenticated earlier but left no application records appear when they
next visit. This is not a complete historical Firebase user export.

The application records verified sign-in providers and first/last observed
authenticated activity going forward. "Active" means observed application use,
not an always-on presence indicator. It does not imply somebody is online now.

Usage measurements are separate from member records. Browser-generated,
per-tab session IDs are hashed with the UTC day and event type. Stored records
contain no raw session ID, email, user ID, IP address, fingerprint or destination
URL. Views and outbound actions count once per project/session/day. Only thirty
days are retained. Do Not Track and Global Privacy Control suppress measurement.
These are usage indicators that can include automated traffic, not audited unique
people or billing statistics. New metrics have no reconstructed earlier history.

## Exports and service boundaries

The export tool downloads bounded pages of members, projects, ownership or audit
records. Its continuation token makes the next page explicit, and CSV cells are
escaped to avoid formula execution. Exports require administrator authorization.
These are operational data exports, not complete backups: Firebase accounts,
passwords, runtime secrets, image binaries and full database restoration are not
included. The System panel accurately marks hosting backup status as unavailable
to the app. Hosting, domain, billing, authentication-provider configuration and
credentials remain managed through their provider accounts.

Existing email alerts still require the configured email provider and sender.
The dashboard shows actual configuration/outbox status and permits bounded retry;
it never claims provider acceptance proves inbox delivery. Dot schedules remain
managed in ChatGPT. This release does not purchase a service or change billing.

## Upgrade and verification

The single forward migration, `0008_nebulous_secret_warriors.sql`, adds Control
Center tables and backfills only those new tables. Migrations 0000–0007 are
immutable. Existing application records, claims, ownership, libraries, profiles,
image references, notification retry state and acknowledgement receipts retain
their original values. Public audience, domain and runtime environment stay on
the existing Site.

The first publication candidate (saved build 13) failed before migration 0008
was applied because D1 permits at most five SELECT terms in a compound query.
The live database was inspected after the failure: all 18 earlier application
tables remained and none of the nine new tables had been created. The backfill
and account-linking queries were corrected for the hosted limits, with explicit
compatibility regression coverage. Earlier applied migrations were unchanged.
See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Release gates are typecheck, the full test suite and a production build. Focused
tests cover roles, owner protection, suspension, canonical linking, race-safe
mutations, moderation propagation, project duplicates, private previews/media,
settings recovery, metrics privacy and the complete prior-schema preservation
boundary. Browser checks use the real guest application and clearly labeled
isolated fixtures for administrative workflows. QA fixtures are excluded from
the published archive. No real project is hidden, account suspended, role granted
or maintenance enabled for production testing.

The previous application is saved release 12, source
`27ddfe639c955e4c3b840abc06345b25c9e17d5f`. Do not reverse the migration or delete
new records for an application rollback. R12 does not enforce the new control
tables, suspensions or moderation, so a naive rollback could expose hidden
content. Prefer a forward repair or deliberately preserve the new enforcement
when preparing any rollback after administrators begin using these controls.
