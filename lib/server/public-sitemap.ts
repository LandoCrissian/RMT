import {RMT_PUBLIC_ORIGIN, projectShareUrl} from '../project-sharing';

const uncached = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

const escapeXml = (value: string) => value.replace(/[<>&'"]/g, c =>
  ({'<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;'}[c]!));

export async function availableSitemap(loadPublicCatalog: () => Promise<{projects: {slug: string}[]}>) {
  try {
    const {projects} = await loadPublicCatalog();
    const urls = new Set([
      ...['/', '/calendar', '/guide'].map(path => RMT_PUBLIC_ORIGIN + path),
      ...projects.map(projectShareUrl),
    ]);
    const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      [...urls].map(url => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n') + '\n</urlset>\n';
    return new Response(body, {headers: {...uncached, 'Content-Type': 'application/xml; charset=utf-8'}});
  } catch {
    // Don't pretend a temporary publishing/data failure means the index is empty.
    return new Response(null, {status: 503, headers: {...uncached, 'Retry-After': '300'}});
  }
}
