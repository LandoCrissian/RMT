# Platform polish release

## Release and rollback

The rollback target is the archived public Sites version 16, source `744b8901b2e9e91ab98a575e710c2f32bda3c5a5`. Saved version ID is `appgprj_6b050b1ea0108191827750aba512a1dd~appgver_cbe822a621a081919f137516bc442282`.

To roll back, redeploy that saved version on the existing public RMT Site. Verify the homepage, catalog, a project page and share image, anonymous rejection on the reviewer endpoint, and Dot’s authenticated digest. Roll back GitHub with a revert commit if the source branch must also track the previous application. The release uses the existing database schema, environment, Firebase project, domain and bindings. An application rollback requires no data restore.

## Audit and corrections

| Area | Release 16 finding | Change |
| --- | --- | --- |
| Compound fields | Handle and sort drew the outline around the inner control. Both search fields lacked a visible enclosing indicator. Studio added a second shadow. | One ring encloses editable text, prefix and icons. Adjacent actions retain their own keyboard focus. Shared error, disabled and busy states and 16px mobile inputs cover forms and uploads. |
| Mobile navigation | Offscreen and background controls could still receive focus. Escape left the drawer open. Several tap targets measured 15–39px tall. | Closed navigation is hidden on mobile. Opening it moves focus, makes the background inert and exposes expanded state. Escape and the close button return focus. Main menu, search, filters, sort/view, pagination and workspace actions use larger targets. |
| Discovery and library | Small metadata, promotional labels, tiny shortcuts and oversized empty panels competed with projects. Above-fold imagery was lazy loaded. | Clearer headings, metadata, hit areas and compact shared panels. Priority hero loading, local preview-size images and on-demand private workspaces reduce public-page work. |
| Showcases | VAMPS repeated actions per destination. Its mobile experience rows measured 126px. A focus-triggered catalog refresh reset dialog scroll. X-only listings repeated the same destination and description. | Compact destinations, exact-match experience previews, project accent throughout the body and updates, one options dialog per interaction and stable scroll on refresh. Sparse listings offer a direct X action. |
| Sharing and editing | The composer omitted project handles. Editors could preselect a creator-only X link when saving an unrelated edit. | Curated project-owned profiles and explicit approved X fields supply the editable draft. Creator-only links remain destinations. Missing handles are omitted. |
| Account, profile and workspaces | Guest sign-in duplicated its call to action. Success and failure used the same amber notice. Review loaders were silent, and submission errors lacked field associations. | A single guest sign-in panel, distinct feedback, accessible status updates, field-level descriptions, standardized inputs, uploads, titles, panels and action sizes. |
| Error routes and dialogs | Missing projects and members had unrelated layouts. The install dialog lacked an accessible title. Clipboard-unavailable environments could throw on admin copy. | Shared unavailable-page layout, named dialogs, and a manual-copy message for the administrator’s account reference. |

## Assets and verification

The experience manifest in `lib/experience-artwork.json` pairs each preview with its exact public project, destination and source. Local WebPs use official media or captures of the public interface. Unknown or changed destinations keep their category icon. Directory thumbnails derive from existing artwork and retain its aspect ratio. Original image and individual project URLs remain available.

The isolated browser matrix covers 320, 360, 390, 430, 768, 1024 and 1440px in Chromium and WebKit. Private-screen layout checks use synthetic account and reviewer fixtures. Separate SQLite regressions cover actual authorization, claims, review and publication. The X checks inspect the editable intent, server-rendered metadata and fetched artwork. Physical iPhone behavior and X’s own crawler cache require those external clients.
