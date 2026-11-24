# Compact project discovery

## Browsing behavior

The directory shows eight projects per page. Phones use two columns; wider screens use three or four. The list option presents the same results as compact rows and uses a project's official logo when available. The selected grid/list preference is remembered in this browser, with an in-memory fallback if storage is unavailable.

Search, category and saved-library filters run across the complete public catalog before pagination. A query, category or sort change starts at page one. Clearing search does not resurrect an old page. Paging stays within the available range if a project disappears from the approved catalog. The result range and total are visible, and page changes move focus to the directory heading.

Name A–Z is the default sort. Newest on RMT uses the date a project first joined this directory, never its collection's mint date. Undated older curated entries follow dated entries and sort by name. Newly approved community listings derive this date from their earliest approved review event. Owner edits and suspension/reapproval retain the original date; pending and suspended projects remain excluded.

The home page contains an editorial VAMPS spotlight, three recently added projects, a compact saved-project shortcut strip, and a direct jump to the directory. The spotlight is explicitly labeled as not sponsored. New listings and ownership claims remain free and reviewed.

## Artwork and new listings

- 1KiSS uses the original 2000×667 OpenSea wordmark banner on the project's burgundy background. The lip-print image remains available as its logo.
- Animal Pharm uses the official website's 2400×900 static header. Its complete title and five characters remain visible, preserving the intentional pixel-art style.
- Clay StonKz, Stray Cucks and HoodFi Names have official covers and separate logos, creator-linked destinations, original OpenSea collection links, project homes, and claim options.
- Original assets and source evidence are recorded in [discovery-project-sources.json](discovery-project-sources.json). No generated replacement project artwork is used.
- Curated crop, background and pixel-art rules apply only to curated assets. An approved owner upload uses its own generic artwork presentation.
- All 20 curated projects have versioned `v3` 1200×630 JPEG share images. Existing older URLs are retained. Approved owner banners still supply their reviewed image URL directly.

## Verification

All 131 automated tests passed, including pagination reachability, full-catalog search before paging, saved scope, stable ordering, first approval dates, unchanged publication boundaries, and all 20 share-image files. Typecheck and the production build passed during implementation; final packaging reruns typecheck and build against the finished source.

Browser checks in the managed preview covered 320, 390, 768 and 1280 pixel frames. Document widths matched scroll widths at each size. Both phone widths retained two grid columns; the 1280 frame used four. Search and sort controls were 16px on phones. Checks also covered page three → partial search → clear returning to page one, newest sorting, persistent list preference after reload, independent bookmark actions, a tap on card body opening its project, complete 1KiSS and Animal Pharm headers, and HoodFi's collection, claim and share-image configuration.

Responsive frames test browser layout rather than physical iPhone behavior. Actual X composer rendering and third-party game or wallet transactions are outside these checks. Publication status and source commits are recorded by Sites and GitHub, rather than inferred from the local preview.
