# Project sharing

## Project URLs and crawler metadata

Every current project has a server route at `https://rmtlaunch.fun/projects/{slug}`. Use that address for copying and sharing. Old `/#project/{id}` links remain a browser navigation convenience; a URL fragment is not sent to the server and cannot select different crawler metadata.

The route's `generateMetadata` supplies a canonical URL, Open Graph title/description/image, and `twitter:card=summary_large_image` in the server response. The page and metadata share a request-scoped approved-catalog lookup. Neither depends on the crawler executing client JavaScript.

`catalog(database())` remains the only publication source: curated entries, approved builder listings, and reviewed public overrides. Pending, rejected and suspended builder listings do not receive a showcase. Private contact information, evidence, account identifiers, verification challenges and review notes are absent from this projection. A database failure does not fall back to an older community listing. Missing project URLs return a real not-found response.

## Artwork

`npm run social:build` creates 1200×630 JPEG cards for all curated projects using their existing attributed artwork. It runs again before an application build. The source is a code-native SVG layout composited with the local project cover using Sharp; there is no image-hosting service, runtime external fetch, or per-share image-generation charge.

Assets are versioned at `/social/{slug}-v1.jpg`; the RMT fallback is `/social/rmt-v1.jpg`. All images are below 5 MB, with their actual size and MIME type checked in tests. The page includes descriptive image alt text. Keep artwork provenance in `docs/catalog-sources.md`. The card displays only the stable project name, source artwork and RMT identity; review-dependent counts and categories do not become stale image text.

New approved projects currently have no artwork submission field and receive the RMT fallback image with their own title and description. A curated project whose name or cover no longer matches the generated source also uses the fallback until its assets are regenerated. When changing a published card's design or imagery, increment `SOCIAL_IMAGE_VERSION` and rebuild so the image receives a new URL. Old posts and social crawlers may retain their own cached previews.

## Access and verification

The Sites audience is a separate hosting control. While RMT is owner-private, an anonymous visitor or X crawler sees the sign-in gate before the application's project page or card asset. Source changes do not change that audience. Public link previews require an owner-authorized public audience and successful anonymous access to both the project HTML and its image. The application still requires a signed-in account for account data and mutations and a server-authorized reviewer for the review workspace.

After the audience is made public, verify without credentials that a project URL returns its unique metadata and a 200 response, the image URL returns `image/jpeg`, unknown project paths return 404, and private APIs still reject anonymous visitors. Then check an actual draft in X's composer; displaying a working local share preview is not evidence that X has fetched or rendered the card. The UI opens a composer only and never publishes a post automatically.

## References

- [The Open Graph protocol](https://ogp.me/) defines page-specific `og:title`, `og:type`, `og:image`, `og:url` and structured image fields.
- [X's former large-image card documentation](https://developer.x.com/en/docs/x-for-websites/cards/overview/summary-card-with-large-image) and [markup reference](https://developer.x.com/en/docs/x-for-websites/cards/overview/markup) redirected to the general developer overview when checked on November 24, 2026. Do not describe an automated test of RMT's tags as current X-side card validation.
- [X Developer Policy](https://docs.x.com/developer-terms/policy) contains current X Cards requirements. No X API key is required by this implementation because it only supplies public webpage metadata and a user-operated composer link.
