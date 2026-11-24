# Netlify entrypoint

The GitHub-connected Netlify project serves a small entrypoint that forwards
visitors to the complete RMT app. The app still runs on the existing Sites
Worker, with its D1 database and authenticated gateway. This does not deploy a
second application backend or move user data to Netlify.

The current destination is `https://rmt-hub.wise-elf-8473.chatgpt.site`.
`scripts/build-netlify-entry.mjs` holds the destination in one place. Use a
custom domain here only after its HTTPS connection and authenticated app are
verified. The destination must not route back to this Netlify entrypoint.

## Build and routing

`netlify.toml` overrides the auto-detected build command and publish directory.
It runs `node scripts/build-netlify-entry.mjs`, which generates only
`dist/netlify-entry/index.html` and `dist/netlify-entry/_redirects`. The output
is covered by the existing `/dist/` ignore rule; local Netlify state is ignored
separately.

`NETLIFY_NEXT_PLUGIN_SKIP=true` disables the automatically detected Next.js
adapter. RMT uses Vinext's Cloudflare Worker build, so the Netlify entrypoint
must not try to package it as a Next.js server. No app credentials, database
bindings, functions, or trusted authentication headers belong in this build.

The forced `302` redirect applies to every path, including `/`. Netlify's
`:splat` forwards the path and its redirect engine forwards query parameters
when the destination does not replace them. Because the redirect destination
has no fragment, browsers retain the incoming fragment, such as `#review`.
The HTML fallback provides a keyboard-accessible **Open RMT** link and a
selectable address. When JavaScript is available, that link also retains the
path, query, and fragment without letting the URL select a different host.

This is a browser redirect, not an API proxy. The browser changes to the app's
own origin and uses its existing sign-in flow. Netlify does not authenticate
visitors or forward identity headers. Netlify deploy previews open the running
app; they are not isolated previews of branch-specific application code.

## Verify a deploy

After the GitHub-connected Netlify build completes:

1. Confirm the build used the configured Node script and published only the
   two generated files, with no server or edge functions.
2. Check the Netlify URL returns a `302` whose `Location` uses the app's origin.
3. Open a deep link with a query and fragment, for example
   `https://rmthub.netlify.app/?from=netlify#review`, and confirm those parts
   survive navigation. Reviewer access still requires the authorized account.
4. Check the full app and its sign-in/session behavior at the destination.

An HTML-only file preview cannot execute Netlify redirect rules; use its
**Open RMT** link. A custom domain mapped directly to the Sites Worker does
not pass through this Netlify entrypoint. Application releases still require
the Sites deployment workflow described in [deployment.md](deployment.md).

## References

- [Netlify configuration schema](https://open-api.netlify.com/netlify.schema.json)
- [Netlify file-based configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/)
- [Netlify redirect options](https://docs.netlify.com/manage/routing/redirects/redirect-options/)
- [Netlify build variables](https://docs.netlify.com/build/configure-builds/environment-variables/)
- [Current Netlify Next.js adapter skip handling](https://github.com/opennextjs/opennextjs-netlify/blob/main/src/index.ts)
- [HTTP fragment inheritance for redirects, RFC 9110 §10.2.2](https://www.rfc-editor.org/rfc/rfc9110.html#name-location)
