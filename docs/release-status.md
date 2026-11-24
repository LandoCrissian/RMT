# RMT first build — release status

## Implemented

- Directory with three sourced, unclaimed project pages and official destination links.
- Search, categories, saved library, responsive navigation and project dialogs.
- Home-screen install metadata and honest offline reconnect page.
- Authenticated applications, persistent moderation states, private owner queue, and audit records.
- Server publication guard, submission quota, active duplicate protection, and URL validation.
- Rejection releases identity reservations so a bogus rejected application cannot permanently block a real builder.
- Hash-routed game destinations keep their launch fragments.

## Not yet open

- Public builder invitation: this deployment is owner-private while the first release is reviewed.
- Curated-listing claims and ongoing publisher edit proposals.
- User-uploaded artwork and arbitrary file hosting.
- Paid Spotlight checkout and purchased placement rotation. The displayed $5 / seven-day offer is a planned option only.
- Cloud-synced libraries, push notifications and wallet integrations.
- Custom-domain migration.

## Before the X invitation

Confirm the first publisher listings and artwork use, finish curated ownership claims, choose public sign-in suitable for invited builders, and open the intended audience deliberately. Add review-queue pagination before volume can exceed the initial 200-row view. Paid exposure must never bypass project approval and must be labeled when activated.

## Verification

The backend tests execute the real repository logic against in-memory SQLite and the tracked migrations. They cover approval boundaries, quotas, duplicates, ownership isolation, review races, rollback, private field exclusion, rejection recovery, and hash routing. Type checking, a production build, browser interaction checks, and a 390px responsive-layout check are performed for this release. See the final delivery for completed results and the exact source commit.
