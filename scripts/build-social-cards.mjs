import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: "export {seedProjects} from './lib/catalog'; export {SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT, SOCIAL_IMAGE_VERSION} from './lib/project-sharing';", resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const {seedProjects, SOCIAL_IMAGE_WIDTH: width, SOCIAL_IMAGE_HEIGHT: height, SOCIAL_IMAGE_VERSION: version} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const destination = join(root, 'public/social');
await mkdir(destination, {recursive: true});

function xml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[char]));
}

function titleLines(value, max = 22) {
  const lines = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

function overlay(project) {
  const lines = titleLines(project.name);
  const size = lines.length > 2 ? 57 : 70;
  const lineHeight = size + 10;
  const startY = 489 - (lines.length - 1) * lineHeight;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="shade" x1="0" x2="1" y1="0" y2="0"><stop stop-color="#0c0e0b" stop-opacity=".95"/><stop offset=".48" stop-color="#0c0e0b" stop-opacity=".76"/><stop offset="1" stop-color="#0c0e0b" stop-opacity=".09"/></linearGradient>
      <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1"><stop offset=".2" stop-color="#0c0e0b" stop-opacity="0"/><stop offset="1" stop-color="#0c0e0b" stop-opacity=".88"/></linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#shade)"/><rect width="1200" height="630" fill="url(#floor)"/>
    <g font-family="DejaVu Sans, Arial, sans-serif">
      <rect x="58" y="47" width="65" height="39" rx="10" fill="#c6ff42"/>
      <text x="90" y="74" text-anchor="middle" font-size="21" font-weight="800" fill="#10120c">RMT</text>
      <text x="140" y="74" font-size="16" letter-spacing="2.6" fill="#fff" opacity=".85">DISCOVER</text>
      <text x="1140" y="73" text-anchor="end" font-size="16" fill="#fff" opacity=".83">rmtlaunch.fun</text>
      <rect x="60" y="${startY - 77}" width="32" height="3" rx="1.5" fill="${xml(project.accent)}"/>
      <text x="107" y="${startY - 70}" font-size="14" font-weight="700" letter-spacing="2.5" fill="#e5e8df">PROJECT SHOWCASE</text>
      ${lines.map((line, index) => `<text x="56" y="${startY + index * lineHeight}" font-size="${size}" font-weight="800" letter-spacing="-2.5" fill="#fff">${xml(line)}</text>`).join('')}
      <text x="60" y="548" font-size="23" fill="#e6e9e0">Explore their world.</text>
      <circle cx="1108" cy="535" r="31" fill="#c6ff42"/>
      <path d="M1097 546l22-22m-20 0h20v20" fill="none" stroke="#15170f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <rect x="0" y="626" width="1200" height="4" fill="${xml(project.accent)}"/>
  </svg>`);
}

for (const project of seedProjects) {
  if (!project.cover.startsWith('/projects/')) throw new Error(`Missing local artwork for ${project.slug}`);
  const sourcePath = resolve(root, 'public', project.cover.slice(1));
  if (!sourcePath.startsWith(join(root, 'public/projects') + '/')) throw new Error('Artwork must be in public/projects.');
  const source = await readFile(sourcePath);
  const base = await sharp(source).resize(width, height, {fit: 'cover', position: 'centre'}).flatten({background: '#11140f'}).toBuffer();
  const cards = [];
  if (project.coverFit === 'contain') {
    // Keep the complete primary art on logo-led listings, with a soft backdrop.
    const backdrop = await sharp(base).blur(15).modulate({brightness: .7}).toBuffer();
    const foreground = await sharp(source).resize(490, 490, {fit: 'inside'}).png().toBuffer();
    const art = await sharp(foreground).metadata();
    cards.push({input: backdrop, left: 0, top: 0}, {input: foreground, left: 655 + Math.round((490 - art.width) / 2), top: Math.round((height - art.height) / 2)});
  }
  cards.push({input: overlay(project), left: 0, top: 0});
  const output = await sharp(base).composite(cards).jpeg({quality: 88, mozjpeg: true}).toBuffer();
  if (output.length >= 5_000_000) throw new Error(`Social card is too large: ${project.slug}`);
  await writeFile(join(destination, `${project.slug}-${version}.jpg`), output);
}

const fallback = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><radialGradient id="glow"><stop stop-color="#405222"/><stop offset="1" stop-color="#10120f"/></radialGradient><pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#d7eea8" stroke-opacity=".055"/></pattern></defs>
  <rect width="1200" height="630" fill="#10120f"/><ellipse cx="1060" cy="240" rx="650" ry="540" fill="url(#glow)"/><rect width="1200" height="630" fill="url(#grid)"/>
  <g fill="#c6ff42" fill-opacity=".1" stroke="#b6df78" stroke-opacity=".3" stroke-width="2"><rect x="823" y="125" width="260" height="320" rx="27" transform="rotate(12 953 285)"/><rect x="788" y="150" width="260" height="320" rx="27" transform="rotate(-8 918 310)"/><rect x="765" y="175" width="260" height="320" rx="27" fill="#20291b"/></g>
  <g font-family="DejaVu Sans, Arial, sans-serif"><text x="62" y="105" font-size="34" font-weight="800" fill="#c6ff42">RMT</text><text x="60" y="310" font-size="64" font-weight="800" letter-spacing="-3" fill="#fff">Your ecosystem.</text><text x="60" y="388" font-size="64" font-weight="800" letter-spacing="-3" fill="#fff">All together.</text><text x="64" y="448" font-size="22" fill="#bdc4b6">Projects, games, and creative tools.</text><text x="64" y="557" font-size="18" fill="#d3ddc4">rmtlaunch.fun</text><text x="893" y="355" text-anchor="middle" font-size="56" font-weight="800" fill="#c6ff42">RMT</text></g><rect y="626" width="1200" height="4" fill="#c6ff42"/>
</svg>`);
await sharp(fallback).jpeg({quality: 88, mozjpeg: true}).toFile(join(destination, `rmt-${version}.jpg`));
console.log(`Generated ${seedProjects.length} project share cards and the RMT fallback (${width}×${height}).`);
