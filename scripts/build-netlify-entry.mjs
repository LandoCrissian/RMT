import { mkdir, rm, writeFile } from "node:fs/promises";

// Keep the destination fixed: this host provides RMT's authenticated runtime
// and database. Change it only after the new destination is verified live.
const appOrigin = "https://rmt-hub.wise-elf-8473.chatgpt.site";
const outputDirectory = new URL("../dist/netlify-entry/", import.meta.url);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, follow">
    <meta name="color-scheme" content="dark">
    <title>Open RMT</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px; background: #101312; color: #f3f5ef; font: 16px/1.6 system-ui, sans-serif; }
      main { width: min(100%, 500px); padding: clamp(24px, 6vw, 48px); background: #191d1a; border: 1px solid #343c33; border-radius: 20px; }
      .brand { color: #d3fd76; font-weight: 900; letter-spacing: .16em; }
      h1 { margin: 20px 0 12px; font-size: clamp(28px, 6vw, 38px); line-height: 1.15; letter-spacing: -.035em; }
      p { color: #bac2b6; }
      a { display: inline-flex; align-items: center; min-height: 48px; margin: 12px 0 16px; padding: 12px 24px; border-radius: 10px; background: #d3fd76; color: #151b0e; font-weight: 800; text-decoration: none; }
      a:hover { background: #e3ffac; }
      a:focus-visible { outline: 3px solid #f3f5ef; outline-offset: 5px; }
      .address { margin-bottom: 0; font-size: 13px; overflow-wrap: anywhere; user-select: all; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">RMT</div>
      <h1>Your projects.<br>One home.</h1>
      <p>Explore project homes, launch experiences, and keep your favorites together.</p>
      <a id="open-rmt" href="${appOrigin}/" target="_top">Open RMT <span aria-hidden="true">&nbsp;↗</span></a>
      <p class="address" id="rmt-address">${appOrigin}/</p>
    </main>
    <script>
      // The native redirect normally runs first. Preserve deep links if this
      // fallback is served by a static preview that cannot process _redirects.
      if (location.protocol === "https:" || location.protocol === "http:") {
        const destination = new URL(${JSON.stringify(appOrigin)});
        destination.pathname = location.pathname;
        destination.search = location.search;
        destination.hash = location.hash;
        document.getElementById("open-rmt").href = destination.href;
        document.getElementById("rmt-address").textContent = destination.href;
      }
    </script>
  </body>
</html>
`;

// Clean only this generated entrypoint; never copy the Worker, its source,
// database files, credentials, or the app's private API responses here.
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("index.html", outputDirectory), html);
await writeFile(
  new URL("_redirects", outputDirectory),
  `/* ${appOrigin}/:splat 302!\n`,
);
console.log(`Built Netlify entrypoint in dist/netlify-entry → ${appOrigin}`);
