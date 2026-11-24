# Activity and member profiles

## Purpose and entry points

RMT members can keep up with the ecosystem and introduce themselves without
changing the existing directory, claims, library, or sign-in flows.

- `/#activity` combines currently approved project updates and real first RMT
  listing events. Filters select new projects, announcements, progress, or
  releases. Six items appear per page; pagination replaces the current page.
- `/#account` links to the profile editor at `/#profile`.
- `/u/{handle}` is a member's optional public profile. It displays only the
  identity, artwork, and links the member explicitly supplies.
- A project's home can link to its current confirmed builders' public profiles
  when those members have chosen to show their managed projects.

Public browsing does not require an account. Editing a profile uses the same
verified RMT identity as claims and the saved library, including existing secure
account links. Google and email/password sign-in remain unchanged. No wallet,
token, payment, or new Firebase project is required.

## Activity publication

`GET /api/activity` accepts one each of `kind`, `limit`, and `cursor`. The
supported kinds are `all`, `announcement`, `progress`, `release`, and `listing`.
The default limit is six, and the maximum is twelve. The cursor includes its
filter plus the last timestamp and stable event ID, giving deterministic keyset
pagination when events have the same timestamp.

The query shares the existing project-update publication and ownership guards.
An update must be approved, its project must currently be public, and the
posting builder's current active ownership revision must match the approved
post. Archived posts, revoked ownership, and suspended community projects do not
enter a subsequent feed response. Filtering happens before pagination.

Listing events use the catalog's known first RMT listing date. A community
listing uses its first approval date, not a later edit or reapproval. Legacy
curated projects with no known listing date remain in the directory without a
fabricated activity event. Listing time is not an NFT collection's launch date.

The public response explicitly projects project context and approved update
content. It does not return private account IDs, contact details, claim evidence,
pending drafts, review notes, or notification records. Failures are presented as
failures, rather than an apparently empty feed.

## Profile privacy and identity

No profile is auto-created from a sign-in provider. New editor forms start
private with empty personal fields and managed-project sharing off. Names,
avatars, and email addresses supplied by Google are not copied into public
profiles. Saved projects remain private in this release.

Members can supply a display name, a handle, a 280-character bio, optional avatar
and banner, and up to four HTTPS links. A handle is normalized to lowercase and
must be unique. Reserved administrative handles are rejected. It may change
before first publication; first publication permanently reserves it to that
account. The editor explains this rule and requires an explicit confirmation
before first publishing. Making the profile private retains the reserved handle.

`GET /api/profile`, `PATCH /api/profile`, and profile-artwork upload/list APIs
require a verified account and the exact `X-RMT-Account` scope. Full profile saves
use a revision check and an atomic audit record. Unknown authority fields are
rejected. Conflicting or uncertain saves preserve local edits and require a
reload of the saved version before another mutation. Account changes clear the
private view. Uploads and saves have bounded daily quotas; a public profile can
still be made private when the edit quota is reached.

Public profile data contains only the member's chosen fields. `isBuilder` and
managed projects derive from current active ownership of public projects, and
are included only when the member opts in. They cannot be assigned by a profile
save. Hiding project relationships also hides the builder label. A revoked claim
or suspended project removes the corresponding relationship from later reads.

Public profile pages, API responses, and media use `no-store`. Profile HTML/RSC
also explicitly disables CDN caching. Profile pages are not indexed in this
initial release. The client rechecks public visibility when returning to a tab
and never reuses an old server-rendered profile after in-app navigation.

## Artwork

Profile images use separate endpoints and authorization from reviewed project
artwork. Browser decoding normalizes permitted still PNG/JPEG/WebP inputs to
PNG; server validation checks the normalized image. The existing project artwork
review flow is unchanged.

Private preview URLs require the asset's owner. A public asset URL serves an
image only while it is ready, currently selected by its owning profile, and that
profile is public. Removing/replacing an image or hiding the profile removes its
eligibility for new public requests. Public eligibility is rechecked after the
storage read. Upload records start private, and storage keys never appear in
public DTOs. Uploads are limited to eight per account per day and two megabytes
each; existing uploads can be reused.

## Preservation and account linking

`0007_remarkable_human_torch.sql` creates only `profiles`, `profile_events`, and
`profile_artwork`, with new indexes. Migrations `0000` through `0006` are
immutable and unchanged. No existing table is dropped, rebuilt, or populated
with profile data. Existing private information stays in the same database and
R2 bucket with its current authorization.

The existing account-link conflict guard now also recognizes profile records,
profile artwork, project artwork, and update drafts. This prevents a later
identity link from orphaning already-created records. It preserves the existing
linking workflow; this release does not invent a data merge or reassign owners.

## Validation and rollout

The release gates are `npm run typecheck`, the complete `npm test` suite, and a
production build. Focused tests cover mixed activity ordering and filtering,
revocation and suspension, public response projection, handle races, save
revisions, private/public transitions, upload ownership, media access, and
identity linking. The upgrade test starts with the deployed R11 schema and data,
applies only 0007, and compares every pre-existing table/index definition and
record, including notification retry state.

Browser checks use the real guest application and separate, clearly labeled
in-memory fixtures for signed-in profile flows. Fixtures contain no production
credentials or writes and must be removed from `public/` before packaging.
The managed preview uses the normal authentication configuration; tests never
enable a production auth bypass. Phone-sized and desktop views cover profile
editing, publication consent, hide/reload behavior, activity filters/pagination,
search, and navigation. The 390px phone preview has no horizontal overflow;
text fields are at least 16px and the mobile navigation has 44px tap targets.
Publication consent, making a profile private, and recovering an interrupted
save were exercised without creating production profile records.

Deployment uses the same Site, database and bucket, preserving the public
audience. Existing sessions are not invalidated. The forward-only schema is
compatible with R11 while the new Worker is being published. A normal deployment
switch does not provide an absolute zero-downtime guarantee.

## Application rollback

The preceding public application is saved Site version 11, source
`a55769bf122d2220a484514cbfac3b3b74aba786`. A rollback may redeploy that saved
version while leaving the new profile tables intact. Do not reverse 0007 or
delete profile records uploaded after this release. The old application cannot
serve the new profile/activity routes and its earlier account-link guard does
not recognize new profile-only activity; resolve that limitation before using
R11 as a long-running rollback with active profile users.

Following, personalized update feeds, comments, direct messages, calendars,
analytics, and paid placement are outside this release. Installability and the
home-screen app already exist and are retained.
