# Project sharing

## Project URLs and crawler metadata

Every current project has a server route at `https://rmtlaunch.fun/projects/{slug}`. Use that address for copying and sharing. Old `/#project/{id}` links remain a browser navigation convenience; a URL fragment is not sent to the server and cannot select different crawler metadata.

The route's `generateMetadata` supplies a canonical URL, Open Graph title/description/image, and `twitter:card=summary_large_image` in the server response. The page and metadata share a request-scoped approved-catalog lookup. Neither depends on the crawler executing client JavaScript.

`catalog(database())` remains the only publication source: curated entries, approved builder listings, and reviewed public overrides. Pending, rejected and suspended builder listings do not receive a showcase. Private contact information, evidence, account identifiers, verification challenges and review notes are absent from this projection. A database failure does not fall back to an older community listing. Missing project URLs return a real not-found response.

## Artwork

The metadata chooses an image from the approved public catalog:

| Project artwork | Image URL | Format and size |
| --- | --- | --- |
| Currently approved owner banner | `/media/project-artwork/{id}` | PNG, with the banner’s actual validated dimensions; up to 2 MiB |
| Curated project without an approved owner banner | `/social/{slug}-v2.jpg` | JPEG, 1200×630 |
| Other approved project without a banner | `/social/rmt-v2.jpg` | JPEG, 1200×630 |

### Reviewed owner banners

Confirmed project managers can propose a logo and banner in Builder Studio. The picker accepts PNG, JPEG and WebP; the upload pipeline produces a validated PNG and keeps it private until the project edit is approved. Metadata uses the approved banner itself, with its actual dimensions, MIME type and descriptive alt text. A logo-only update retains the curated share-card fallback where available. See [reviewed project artwork](project-artwork.md) for the complete workflow and ownership checks.

Each uploaded asset has a unique URL. The public image route serves it only while the current approved override for a public project references that ID. Replacing or removing the image invalidates its old URL; suspending a community listing also removes public image access. Pending uploads, private storage keys and uploader identities never appear in share metadata. Public artwork responses use `Cache-Control: no-store` and `nosniff`.

### Curated v2 cards

`npm run social:build` creates the 1200×630 JPEG cards using existing attributed local artwork, and runs again before an application build. A code-native SVG layout is composited with the cover using Sharp. Wide originals use a panoramic layout that preserves the full foreground artwork above the title. Logo-led cards also retain the full foreground mark over a softened background.

The current assets use `SOCIAL_IMAGE_VERSION = 'v2'`. The build enforces a file size below 5 MB, and automated tests check actual dimensions and MIME types. Keep artwork provenance in `docs/catalog-sources.md`. Cards show the stable project name, source artwork and RMT identity; review-dependent counts and categories are omitted from the generated image. These local cards do not require a runtime external image fetch or image-generation service.

A curated project whose identity or cover no longer matches the generated source uses the RMT fallback unless it has approved artwork supported by the metadata rules. When changing a generated card’s design or imagery, increment `SOCIAL_IMAGE_VERSION` and rebuild to give it a new URL. Earlier releases used the `v1` assets. Old posts and social crawlers may retain their own cached previews even after RMT changes its metadata or image access.

## Access and verification

The current Sites audience is public. Visitors and crawlers can request public project pages and approved share images without signing in. Ordinary users can use Google or email/password accounts from any valid email provider; a ChatGPT account is not required. Private account data and builder operations still require server-verified identity, and the review workspace requires an exact server-authorized reviewer. Earlier owner-private release notes describe the historical hosting gate, not the current audience.

For each publication, verify without credentials that a project URL returns its unique metadata and a 200 response, its image returns the declared PNG or JPEG content type and dimensions, unknown project paths return 404, and private APIs reject anonymous visitors. Owner uploads also need a real authenticated upload/review check; unit tests cover the rules without establishing that live outcome.

Check an actual draft in X’s composer separately. Automated metadata checks and a working on-site preview do not show that X fetched or rendered the card. This documentation does not claim a completed live owner upload, email delivery, or X composer validation. The UI opens a composer and never publishes a post automatically.

## References

- [The Open Graph protocol](https://ogp.me/) defines page-specific `og:title`, `og:type`, `og:image`, `og:url` and structured image fields.
- [X's former large-image card documentation](https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image) and [markup reference](https://developer.x.com/en/docs/x-for-websites/cards/overview/markup) redirected to the general developer overview when checked on November 24, 2026. Do not describe an automated test of RMT's tags as current X-side card validation.
- [X Developer Policy](https://docs.x.com/developer-terms/policy) contains current X Cards requirements. No X API key is required by this implementation because it only supplies public webpage metadata and a user-operated composer link.
