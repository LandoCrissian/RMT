import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: `export * from './lib/project-permalinks'; export * from './lib/project-sharing'; export * from './lib/reviewed-community-artwork'; export * from './lib/server/project-showcase'; export {createSubmission, reviewSubmission} from './lib/server/repository'; export {validateSubmission, validateDecision} from './lib/submission-validation'; export {seedProjects} from './lib/catalog';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(migrations.map(file => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')))).join('\n');

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(schema);
  t.after(() => sqlite.close());
  function prepare(sql, values = []) {
    return {
      bind(...params) { return prepare(sql, params); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...values), meta: {changes: 0}}; },
      async run() { return {success: true, results: [], meta: {changes: Number(sqlite.prepare(sql).run(...values).changes)}}; },
    };
  }
  return {prepare, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  }};
}

test('each curated project has an individual canonical path, large-image metadata and artwork URL', () => {
  const urls = new Set();
  const images = new Set();
  for (const project of api.seedProjects) {
    const metadata = api.projectMetadata(project);
    assert.equal(metadata.title, `${project.name} | RMT`);
    assert.equal(metadata.alternates.canonical, `https://rmtlaunch.fun/projects/${project.slug}`);
    assert.equal(metadata.openGraph.url, metadata.alternates.canonical);
    assert.equal(metadata.twitter.card, 'summary_large_image');
    assert.equal(metadata.openGraph.images[0].url, metadata.twitter.images[0].url);
    assert.equal(metadata.openGraph.images[0].width, 1200);
    assert.equal(metadata.openGraph.images[0].height, 630);
    assert.equal(metadata.openGraph.images[0].type, 'image/jpeg');
    assert.match(metadata.openGraph.images[0].alt, new RegExp(project.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(metadata.description.length <= 200);
    urls.add(metadata.alternates.canonical); images.add(metadata.openGraph.images[0].url);
  }
  assert.equal(urls.size, api.seedProjects.length);
  assert.equal(images.size, api.seedProjects.length);
});

test('new projects and mismatched artwork use the RMT fallback without stale project claims', () => {
  const vamps = api.seedProjects.find(project => project.id === 'vamps');
  const unknown = {...vamps, id: 'community-new', slug: 'project-new', name: 'New project', cover: 'community'};
  for (const project of [unknown, {...vamps, cover: '/new-approved-artwork.png'}]) {
    assert.equal(api.projectSocialImagePath(project), `/social/rmt-${api.SOCIAL_IMAGE_VERSION}.jpg`);
    assert.equal(api.projectMetadata(project).openGraph.images[0].alt, 'RMT — discover projects, games, and creative tools');
  }
  const renamed=api.shareCardPlan({...vamps,name:'A changed name'});
  assert.equal(renamed.kind,'composed');
  assert.equal(renamed.title,'A changed name');
  assert.equal(renamed.art,vamps.cover);
});

test('share URLs use the canonical host and X composer keeps names and URL separate', () => {
  const project = {slug: 'a/b?next=elsewhere', name: 'Example & Co #1'};
  assert.equal(api.projectShareUrl(project), 'https://rmtlaunch.fun/projects/a%2Fb%3Fnext%3Delsewhere');
  const intent = new URL(api.projectXIntentUrl(project));
  assert.equal(intent.origin, 'https://x.com');
  assert.equal(intent.pathname, '/intent/post');
  assert.equal(intent.searchParams.get('text'), 'Explore Example & Co #1 on @RMTLaunch.');
  assert.equal(intent.searchParams.get('url'), api.projectShareUrl(project));
  assert.equal([...intent.searchParams].length, 2);
});

test('reviewed edition cards and administrator settings select versioned, project-scoped artwork',()=>{
  for(const id of api.artDirectedProjects){
    const project=api.seedProjects.find(item=>item.id===id);
    const designed=api.shareCardPlan(project);
    assert.equal(designed.kind,'designed');
    assert.equal(api.shareCardPlan({...project,presentation:{cardMode:'project'}}).path,designed.path);
    assert.equal(api.shareCardPlan({...project,presentation:{cardMode:'fallback'}}).kind,'fallback');
    const changed=api.shareCardPlan({...project,presentation:{cardStyle:'portrait',accent:'#efabad',hero:project.cover}});
    assert.equal(changed.kind,'composed');
    assert.equal(changed.art,project.cover);
    assert.notEqual(changed.path,designed.path);
    assert.equal(changed.style,'portrait');
    assert.equal(changed.accent,'#efabad');
    assert.equal(api.projectMetadata({...project,presentation:{shortDescription:'Reviewed listing text.'}}).description,'Reviewed listing text.');
  }
});

test('future approved uploads produce project cards; unapproved image paths cannot enter the renderer',()=>{
  const id='e314e66b-2c25-4aa0-96fb-8eb740702652';
  const url='/media/project-artwork/'+id;
  const project={id:'community-new',slug:'community-new',name:'Future project',cover:'community',accent:'#574973'};
  const valid={id,url,mime:'image/png',width:800,height:450};
  assert.equal(api.shareCardPlan({...project,artwork:{banner:valid}}).art,url);
  assert.equal(api.shareCardPlan({...project,artwork:{logo:valid}}).style,'portrait');
  for(const path of ['https://example.org/unreviewed.jpg','/projects/vamps-cover.webp',url]){
    assert.equal(api.shareCardPlan({...project,presentation:{hero:path,cardMode:'project'}}).kind,'fallback');
  }
});

test('showcases stay unavailable until approved and disappear after suspension', async t => {
  const db = database(t);
  const input = api.validateSubmission({name: 'A new showcase', summary: 'An independent browser game with a playable public destination.', category: 'Games',
    website: 'https://showcase-example.dev/', launchUrl: 'https://showcase-example.dev/play', xProfile: '',
    contactEmail: 'private-contact@example.dev', ownershipEvidence: 'Private ownership evidence must never enter the public HTML.', companyFax: ''});
  const created = await api.createSubmission(db, {userId: 'private-builder-id', email: 'private-account@example.dev', displayName: 'Builder'}, input);
  const slug = `project-${created.id}`;
  assert.equal(await api.projectShowcase(db, slug), null);
  const approval = api.validateDecision({action: 'approve', expectedRevision: 1, note: 'Reviewed official ownership and destination.', confirmedOwnership: true, checkedLinks: true});
  await api.reviewSubmission(db, 'reviewer', created.id, approval);
  const approved = await api.projectShowcase(db, slug);
  assert.equal(approved.project.name, 'A new showcase');
  const card=api.shareCardPlan(approved.project);
  assert.equal(card.kind,'composed');
  assert.equal(card.art,api.communityCardMark);
  assert.equal(card.title,approved.project.name);
  assert.equal(api.projectMetadata(approved.project).openGraph.images[0].url,api.RMT_PUBLIC_ORIGIN+card.path);
  const visible = JSON.stringify({...approved, metadata: api.projectMetadata(approved.project)});
  for (const privateValue of ['private-builder-id', 'private-account@example.dev', 'private-contact@example.dev', input.ownershipEvidence, created.verificationCode]) {
    assert.equal(visible.includes(privateValue), false, privateValue);
  }
  await api.reviewSubmission(db, 'reviewer', created.id, api.validateDecision({action: 'suspend', expectedRevision: 2, note: 'The destination is no longer available.'}));
  assert.equal(await api.projectShowcase(db, slug), null);
});

test('unknown showcases return no listing and catalog failures do not revive old content', async t => {
  const db = database(t);
  assert.equal(await api.projectShowcase(db, 'not-a-project'), null);
  assert.equal(await api.projectShowcase(db, '../vamps'), null);
  assert.equal((await api.projectShowcase(db, 'vamps')).project.id, 'vamps');
  await assert.rejects(api.projectShowcase({prepare() { throw new Error('Database unavailable'); }}, 'vamps'), /Database unavailable/);
});

test('all served social images are actual 1200×630 JPEGs below 5 MB', async () => {
  const paths = [...api.seedProjects.map(project=>api.shareCardPlan(project).kind==='designed'
    ? '../lib/server/share-card-images/'+project.slug+'.jpg' : '../public'+api.projectSocialImagePath(project)),
    `../public/social/rmt-${api.SOCIAL_IMAGE_VERSION}.jpg`];
  for (const path of paths) {
    const bytes = await readFile(new URL(path, import.meta.url));
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'jpeg', path);
    assert.equal(metadata.width, 1200, path);
    assert.equal(metadata.height, 630, path);
    assert.ok(bytes.length < 5_000_000, path);
  }
});
test('X drafts mention RMT and the reviewed project profile when available', () => {
  const text = project => new URL(api.projectXIntentUrl(project)).searchParams.get('text');
  const flagship = api.seedProjects.find(project => project.id === 'vamps');
  assert.equal(text(flagship), 'Explore VAMPS (@VampsOnChain) on @RMTLaunch.');
  const creatorOnly = api.seedProjects.find(project => project.id === 'stray-cucks');
  assert.equal(text(creatorOnly), `Explore ${creatorOnly.name} on @RMTLaunch.`);
  for (const url of ['', 'https://x.com/intent/post', 'https://x.com/example/status/123', 'https://elsewhere.dev/example']) {
    assert.equal(text({...flagship, officialXProfile: url}), 'Explore VAMPS on @RMTLaunch.');
  }
  assert.match(text({...flagship, officialXProfile: 'https://twitter.com/Approved_Name'}), /\(@Approved_Name\)/);
});

test('each destination preview belongs to its listed project and a local decodable image', async () => {
  const media = JSON.parse(await readFile(new URL('../lib/experience-artwork.json', import.meta.url), 'utf8'));
  const unique = new Set();
  for (const {project, destination, source, image, alt} of media) {
    const listing = api.seedProjects.find(item => item.id === project);
    assert.ok(listing?.links.some(link => link.url === destination), destination);
    assert.ok(source.startsWith('https://') && alt);
    assert.ok(!unique.has(project + destination));
    unique.add(project + destination);
    const metadata = await sharp(await readFile(new URL('../public' + image, import.meta.url))).metadata();
    assert.ok(metadata.width > 0 && metadata.height > 0);
  }
});

test('APEX artwork is reviewed for this exact approved listing and yields a complete publisher card',async()=>{
  const [record]=JSON.parse(await readFile(new URL('../lib/reviewed-community-artwork.json',import.meta.url),'utf8'));
  const base={id:record.id,slug:record.slug,name:record.name,website:record.website,source:'community',cover:'community'};
  for(const change of [{website:'https://elsewhere.dev/'},{id:'unknown'},{slug:'similar-project'},{source:'curated'}]){
    const other={...base,...change};
    api.applyReviewedCommunityArtwork(other);
    assert.equal(other.cover,'community');
    assert.notEqual(api.shareCardPlan(other).path,record.card);
  }
  const project={...base};
  api.applyReviewedCommunityArtwork(project);
  assert.equal(project.cover,record.cover);
  assert.equal(project.logo,record.logo);
  assert.equal(api.shareCardPlan(project).path,record.card);
  assert.equal(api.shareCardPlan({...project,presentation:{cardStyle:'editorial'}}).kind,'composed');
  assert.equal(api.shareCardPlan({...project,presentation:{cardMode:'fallback'}}).kind,'fallback');
  const changed={...base,artwork:{logo:{url:'/media/approved'}},cover:'/media/approved'};
  api.applyReviewedCommunityArtwork(changed);
  assert.equal(changed.cover,'/media/approved');
  const {createHash}=await import('node:crypto');
  for(const [asset,width,height] of [[record.cover,1600,900],[record.logo,180,180],[record.card,1200,630]]){
    const bytes=await readFile(new URL('../public'+asset,import.meta.url));
    const info=await sharp(bytes).metadata();
    assert.deepEqual([info.width,info.height],[width,height]);
    assert.ok(asset.includes(createHash('sha256').update(bytes).digest('hex').slice(0,8)));
  }
});

test('APEX changes its public permalink while existing links retain their query and other project routes stay distinct',()=>{
 const id='a03d19b5-8cb0-47b6-97a8-23ecf5e5f194';
 assert.equal(api.communitySlug(id),'apex-rising');
 assert.equal(api.communitySlug('other'),'project-other');
 const old='https://rmtlaunch.fun/projects/project-'+id+'/?source=share';
 for(const method of ['GET','HEAD']){
  const redirect=api.legacyProjectRedirect(new Request(old,{method}));
  assert.equal(redirect.status,308);
  assert.equal(redirect.headers.get('location'),'https://rmtlaunch.fun/projects/apex-rising?source=share');
 }
 assert.equal(api.legacyProjectRedirect(new Request('https://rmtlaunch.fun/projects/apex-rising')),null);
 assert.equal(api.legacyProjectRedirect(new Request(old,{method:'POST'})),null);
});
