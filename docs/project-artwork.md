# Reviewed project artwork

Confirmed project managers can propose a logo and banner in **Builder Studio → My projects → Edit project**. Uploads are free. Uploading alone does not publish an image: the manager submits a project edit and a reviewer approves the complete update. The existing listing remains visible during review.

## Storage and validation

- The file picker accepts static PNG, JPEG and WebP, up to 2 MiB per source image. SVG, GIF and animation are rejected. Logos must be square and at least 128 × 128; banners must be at least 600 × 300 with an aspect ratio from 1.5:1 through 4:1. Each input is limited to 4096 pixels per side and 8 million total pixels.
- JPEG and WebP are structurally checked, decoded in the browser, and converted to a PNG. This intentionally avoids treating header checks as a complete JPEG/WebP decoder on the Worker. Conversion preserves the image proportions and reduces large images until the PNG fits the byte limit. The returned private preview is the image being reviewed.
- The server accepts PNG bytes only. It independently checks signature, complete chunk framing and checksums, image dimensions, the compressed stream and exact scanline size, and rejects animation, unsupported structures, and trailing bytes. Non-render metadata is stripped. File names, file extensions and client dimensions are never trusted.
- Originals are not retained. R2 stores the validated image under an application-generated object key; the public bucket is never exposed. `project_artwork` in D1 stores the uploader, ownership-grant revision, project, kind, dimensions, digest and object state.
- Each verified manager account can reserve up to eight uploads in a rolling 24-hour window. Reservations and the current ownership revision are checked in one SQL statement. An ownership change during storage prevents the image from becoming ready and triggers object removal.

Deployment requires the existing D1 database, the appended `0005_aromatic_dracula` migration after account linking, and a persistent R2 binding named `BUCKET`. No new image service, payment provider or public R2 endpoint is needed.

## Visibility and review

`POST /api/project-artwork?projectId=…&kind=logo|banner` accepts the normalized PNG from a verified current manager with an exact same-origin request. `GET /api/project-artwork?projectId=…` lists that manager’s ready uploads for the current ownership grant.

`GET /api/project-artwork/{id}` is a private preview. Only its current manager/uploader or a server-authorized reviewer can read it. The React preview fetches bytes using the existing authenticated session cookie and uses a temporary object URL, so credentials never appear in image URLs.

Project edits have optional `logoAssetId` and `bannerAssetId` fields. Omitting a field preserves the currently published asset for compatibility with older clients; `null` explicitly removes that upload. The cover then uses a remaining logo or the original/default artwork. Each supplied ID must match the project and image role. A manager can use their current-grant uploads or keep an already published image. A successor cannot reference the previous manager’s private uploads.

Creation and approval recheck asset readiness and ownership in SQL, alongside existing revision guards. Reviewers compare current and proposed artwork in the existing edit queue and record their decision. Only approved overrides enter the public catalog; pending asset IDs and storage metadata do not.

`GET /media/project-artwork/{id}` serves an image only while the current approved override for a public project references that exact ID. Replacing or removing it invalidates the old public URL. Suspending a community listing also removes public image access. Responses have fixed PNG content type, `nosniff`, and `Cache-Control: no-store`; private identifiers, raw bucket keys and uploaded names are not returned.

## Project display and sharing

Approved banners become project covers and the exact Open Graph/Twitter image, with their actual dimensions and MIME type. Each new upload gets a new URL, so subsequent approved versions have distinct share-image URLs. Approved logos appear beside the project name; a logo also supplies the cover when no uploaded banner exists. Projects without an approved banner retain the existing curated social card or RMT fallback.

X controls its own cached previews. Application-level metadata and anonymous image responses can be checked independently; neither proves an existing X post has refreshed its cache.

## Verification

`tests/project-artwork.test.mjs` exercises private pending storage, normalized-PNG enforcement, current-manager access, cross-project and wrong-role references, grant changes, stale approval, atomic upload quota, public replacement/removal, approved share metadata and community suspension. `tests/project-artwork-validation.test.mjs` uses actual image fixtures for format checks, limits, metadata removal and malformed-container cases.
