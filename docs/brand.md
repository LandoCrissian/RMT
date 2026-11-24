# RMT identity, v0.5

RMT is a discovery hub for projects, games, creative apps, and communities. The updated icon keeps the original stacked R–M–T monogram and green identity. Broader strokes and clean negative space improve its reading at home-screen sizes. The original market arrow, terminal cursor, and outer cage are removed.

## Assets

- Selected generated master: `public/brand/rmt-icon-master-v5.png` (1254 × 1254).
- PWA/app icon: `public/icons/rmt-512-v5.png` (512 × 512).
- In-product mark and small PWA icon: `public/icons/rmt-mark-v5.png` (192 × 192).
- Apple touch icon: `public/icons/rmt-180-v5.png` (180 × 180).
- Browser icon: `public/icons/rmt-32-v5.png` (32 × 32).

The full square background lets the device apply its own mask. The lime foreground fits inside the central maskable safe circle (measured radius below 0.373 of the image width; safe-circle radius 0.4). The manifest uses versioned filenames so new installs request the new asset. Existing shortcuts may retain their saved icon until the browser refreshes them or the user adds the shortcut again.

The master was generated with the built-in image-generation tool using the owner's original icon screenshot as its reference. `npm run brand:build` resizes that selected artwork with Sharp; it does not generate or redesign the mark. Keep the selected master and derivatives in the repository. No external image service is needed at runtime.

## Generation prompt

> Use case: logo-brand / precise-object-edit. Asset type: production iPhone/PWA home-screen app icon for RMT, a premium discovery hub where people find, save, and launch games, creative apps, and communities. Input image: the supplied phone screenshot is a reference for the existing RMT mark, NOT a scene to reproduce. Redesign ONLY that brand icon as a clean standalone square master image, 1024 x 1024, filling the complete canvas. Preserve the distinctive stacked interlocking letters R, M, T and the electric-green-on-black identity, but greatly simplify and refine the geometry, spacing and small-size legibility. Shift the brand away from trading: remove the upward market arrow, terminal cursor and outer hexagonal cage. Make an elegant tightly integrated RMT monogram, R at the top, broad M in the middle and T below, consistent substantial angular strokes, clean negative space, slightly softened corners. A subtle forward-opening gap may suggest entering an app hub. Premium graphite background #101216 with restrained tonal depth and barely perceptible inner edge; crisp chartreuse-lime #CCFF00 mark with very subtle fresh-green gradient, no chrome. Mark occupies central 64 percent of square with generous safe margin for phone masking. Modern independent software / gaming library feel, confident and highly recognizable at 48px. Flat front view, no perspective. No phone, no screenshot borders, no app label, no additional words, no badge, no drop shadow outside the image. Do not draw rounded outer corners; use a full-bleed square so the phone applies its own mask. Output one finished icon, not a sheet of variations.

The tool returned a 1254 × 1254 master. Web variants are resized to the exact dimensions declared in the manifest and page metadata.
