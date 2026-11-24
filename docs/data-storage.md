# Accounts and saved information

## Sign-in

RMT supports Google or email/password accounts through the dedicated Firebase project. Any valid email provider can register for free. Firebase sends email verification and password recovery links. Ordinary users do not need ChatGPT or a crypto wallet; public browsing and device favorites work without signing in.

The server verifies Firebase tokens, account status, and email verification before authorizing private operations. New users have namespaced Firebase account IDs. Existing accounts may prove both old and new identities once to link their records without changing original user IDs. Reviewer access still requires an exact server allowlist match; neither an email address nor a client role flag grants it. See [Firebase authentication](firebase-authentication.md).

The Site audience is public. Account libraries, claims, applications, proposed edits, and reviewer operations still enforce server-side identity and authorization. Legacy Sites authentication remains available for account migration and the existing dot monitoring integration.

## What is saved where

| Information | Storage and access |
| --- | --- |
| Curated project names, artwork, and official links | Versioned application source and public project catalog. |
| A signed-in user's saved-project library | Hosted D1 database (`saved_projects`), scoped to that user's verified RMT account ID. Rows contain account ID, project ID, and save time; no wallet key or email address. |
| A guest's saved-project library | That browser's local storage. It does not automatically follow the visitor to another device. Clearing browser storage can remove it. |
| Project applications, ownership claims, and proposed updates | Hosted D1 database. Pending records remain private to the submitter and authorized reviewers. |
| Contact information and ownership evidence | Private application/claim records, not the public catalog or GitHub source. |
| Uploaded project logos and banners | Private R2 object storage, with D1 metadata. Only the current approved image is exposed publicly; pending previews require the current manager or a reviewer. |
| Review decisions and history | Hosted D1 database, with reviewer identity and record revisions. |
| Notification queue and monitor acknowledgements | Hosted D1 database. Provider credentials and the owner's notification recipient remain server runtime settings. |

D1 uses SQLite. Saving an item to an account is acknowledged only after the server writes it. A browser refresh or application redeployment does not intentionally erase these database records. Data is not put on a blockchain, and RMT does not store the external games or music that project links open.

## Personal library behavior

Signed-in accounts can save up to **200 projects**. The server checks the cap inside the write operation so concurrent devices cannot exceed it. Saving or removing the same project repeatedly is safe. Library APIs always select the signed-in account from the server identity, never a caller-supplied account ID.

Every library request also sends `X-RMT-Account` with the account ID currently displayed by the client. The server compares it with the authenticated identity; a missing or mismatched value receives HTTP 409 with `code: "account_changed"`, without reading or writing the library. This is a consistency guard, not an alternative sign-in mechanism. It prevents a tab showing one account from accidentally saving into a different account after sign-in changes in another tab. Clients refresh the session after that error and never silently retry the mutation.

Importing device favorites is an explicit action. It merges currently public projects into the account library without deleting existing account favorites. Duplicate and already-saved entries are ignored; missing, unavailable, and capacity-limited items are reported as skipped. No account change should silently import another person's device favorites.

If a saved project becomes unavailable, its project ID remains in the account library until the user removes it. Private application details are not exposed by that saved ID. API responses are marked `Cache-Control: no-store`, and the service worker does not cache private account data.

## Hosting and recovery

The database lives with the hosted Site; it is separate from the GitHub code repository and from browser local storage. GitHub preserves application source and migration definitions, not a backup of private application rows. Moving to another host requires migrating the database and preserving Firebase token verification and replacing the legacy gateway adapter. Backup/export and account deletion policies should be defined before a public launch; this release does not claim those workflows are already implemented.
