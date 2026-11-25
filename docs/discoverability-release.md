# RMT public discoverability

The signed-out homepage exposes native project links on the cards, arrival list and
spotlights. Ordinary clicks still open the showcase dialog and modified clicks
open the canonical route using browser behavior. Direct project requests render
the same showcase inline with a project-specific primary heading. The public
beginner guide uses the same published lessons as the interactive guide.

The sitemap uses the same moderated public catalog as the homepage, including
the final visibility recheck. It includes only the homepage, calendar, beginner
guide and current project permalinks. It does not use a cache, publish private
workspaces or guess modification dates. A failed D1 read or maintenance returns
503 with a retry hint. The robots file advertises the sitemap. No crawler's
training policy was changed.

## Public domain follow-through

- Sites reports the apex and www bindings active with active SSL and a public
  audience. The managed audit browser receives 403 for both custom names, while
  the Sites runtime origin responds. Some public search fetches can see cached
  homepage content. This is not evidence of Googlebot behavior or a global outage.
- Verify anonymous GETs for the homepage, sitemap, project and share image on
  independent networks and via the domain's Search Console live inspection.
  Record the status, canonical, and redirect chain without storing credentials.
- Leave the current Netlify fallback working until the canonical domain passes
  those checks. Do not change Firebase callback or application account routes
  when consolidating public URLs. Test path and query preservation before making
  stable redirects permanent.
- Submit the sitemap from existing search-console access after successful live
  fetches. Test previews in X and another channel before the opt-in partner pilot.
- No migrations, custom-domain edits, billing, analytics scope changes or new
  credentials are needed for this application release.
