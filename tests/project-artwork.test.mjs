import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../',import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/server/project-artwork'; export * from './lib/server/project-edits'; export * from './lib/server/repository'; export * from './lib/submission-validation'; export * from './lib/project-sharing'; export {getSeedProjects} from './lib/catalog';`,resolveDir: root,loader: 'ts'},absWorkingDir: root,bundle: true,write: false,platform: 'node',format: 'esm',target: 'node24'});
const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const migrations = (await readdir(new URL('../drizzle/',import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(migrations.map(file => readFile(new URL('../drizzle/' + file,import.meta.url),'utf8')))).join('\n');
const logoBytes = await sharp({create: {width: 128,height: 128,channels: 4,background: '#c6ff42'}}).png().toBuffer();
const bannerBytes = await sharp({create: {width: 1200,height: 630,channels: 3,background: '#23282e'}}).png().toBuffer();
const user = {userId: 'firebase:rmt-test:owner',email: 'owner@example.dev',displayName: 'Owner',emailVerified: true,provider: 'firebase'};
const secondId = api.getSeedProjects().find(project => project.id !== 'vamps').id;
const rejectsStatus = status => error => error instanceof api.InputError && error.status === status;

function database(t) {
  const raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=ON'); raw.exec(schema); t.after(() => raw.close());
  function prepare(sql,values = []) { return {
    bind(...parameters) { return prepare(sql,parameters); },
    async first() { return raw.prepare(sql).get(...values) ?? null; },
    async all() { return {success: true,results: raw.prepare(sql).all(...values),meta: {changes: 0}}; },
    async run() { return {success: true,results: [],meta: {changes: Number(raw.prepare(sql).run(...values).changes)}}; },
  }; }
  let queue = Promise.resolve();
  return {raw,prepare,batch(statements) {
    const result = queue.then(async () => { raw.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); raw.exec('COMMIT'); return results; } catch (error) { raw.exec('ROLLBACK'); throw error; } });
    queue = result.catch(() => {}); return result;
  }};
}
function bucket() {
  const objects = new Map();
  return {objects,async put(key,bytes) { objects.set(key,Uint8Array.from(bytes)); },async delete(key) { objects.delete(key); },async get(key) {
    const value = objects.get(key); return value ? {size: value.length,body: new Response(value).body} : null;
  }};
}
function own(db,projectId = 'vamps',owner = user) {
  db.raw.prepare("INSERT INTO project_owners (project_id,user_id,claim_id,status,revision,created_at,updated_at) VALUES (?,?,NULL,'active',1,?,?)").run(projectId,owner.userId,Date.now(),Date.now());
}
function edit(projectId = 'vamps',baseRevision = 0,extra = {}) {
  return api.validateProjectEdit({projectId,baseRevision,summary: 'A reviewed home for our new browser experiences, games and community tools.',category: 'Games',stage: 'building',website: 'https://example.dev/',launchUrl: 'https://example.dev/play',xProfile: '',links: [],...extra});
}
async function upload(db,store,kind = 'banner',projectId = 'vamps',owner = user) {
  return api.uploadProjectArtwork(db,store,owner,projectId,kind,kind === 'logo' ? logoBytes : bannerBytes,'image/png');
}
async function approve(db,change) {
  return api.reviewProjectEdit(db,'reviewer',change.id,{action: 'approve',note: 'Reviewed artwork and official destinations.',expectedRevision: change.revision});
}

test('uploads require verified identity, a public project and the current active manager',async t => {
  const db = database(t),store = bucket(); own(db);
  await assert.rejects(upload(db,store,'logo','vamps',{...user,emailVerified: false}),rejectsStatus(403));
  await assert.rejects(upload(db,store,'logo','vamps',{...user,userId: 'other'}),rejectsStatus(404));
  await assert.rejects(upload(db,store,'logo','missing-project'),rejectsStatus(404));
  db.raw.prepare("UPDATE project_owners SET status='revoked',revision=2 WHERE project_id='vamps'").run();
  await assert.rejects(upload(db,store),rejectsStatus(404));
  assert.equal(store.objects.size,0);
});

test('raw uploads enforce same origin, fixed media type and a streamed byte limit',async () => {
  const request = (headers,body = logoBytes) => new Request('https://rmtlaunch.fun/api/project-artwork',{method: 'POST',headers,body});
  await assert.rejects(api.readArtworkUpload(request({'content-type': 'image/png',origin: 'https://attacker.dev'})),rejectsStatus(403));
  await assert.rejects(api.readArtworkUpload(request({'content-type': 'image/svg+xml',origin: 'https://rmtlaunch.fun'})),rejectsStatus(415));
  for (const mime of ['image/jpeg','image/webp']) await assert.rejects(api.readArtworkUpload(request({'content-type': mime,origin: 'https://rmtlaunch.fun'})),rejectsStatus(415));
  await assert.rejects(api.readArtworkUpload(request({'content-type': 'image/png',origin: 'https://rmtlaunch.fun'},new Uint8Array(2*1024*1024+1))),rejectsStatus(413));
  const result = await api.readArtworkUpload(request({'content-type': 'image/png',origin: 'https://rmtlaunch.fun'}));
  assert.deepEqual(Buffer.from(result.bytes),logoBytes);
});

test('server storage rejects JPEG and WebP even when their headers are valid',async t => {
  const db = database(t),store = bucket(); own(db);
  const jpeg = await sharp(logoBytes).jpeg().toBuffer(),webp = await sharp(logoBytes).webp().toBuffer();
  for (const [bytes,mime] of [[jpeg,'image/jpeg'],[webp,'image/webp']]) {
    await assert.rejects(api.uploadProjectArtwork(db,store,user,'vamps','logo',bytes,mime),rejectsStatus(415));
    await assert.rejects(api.uploadProjectArtwork(db,store,user,'vamps','logo',bytes,'image/png'),rejectsStatus(400));
  }
  assert.equal(store.objects.size,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_artwork').get().n,0);
});

test('pending artwork stays private and no original filename, R2 key or owner identity enters public metadata',async t => {
  const db = database(t),store = bucket(); own(db);
  const asset = await upload(db,store);
  assert.equal(asset.mime,'image/png'); assert.equal(asset.width,1200); assert.equal(asset.height,630);
  assert.equal(asset.objectKey,undefined); assert.equal(asset.userId,undefined);
  const row = await api.privateArtworkRow(db,asset.id,user.userId,false);
  await assert.rejects(api.privateArtworkRow(db,asset.id,'other',false),rejectsStatus(404));
  assert.equal((await api.privateArtworkRow(db,asset.id,'reviewer',true)).id,asset.id);
  await assert.rejects(api.publicArtworkRow(db,asset.id),rejectsStatus(404));
  const change = await api.createProjectEdit(db,user,edit('vamps',0,{bannerAssetId: asset.id}));
  assert.equal(change.bannerAssetId,asset.id);
  await assert.rejects(api.publicArtworkRow(db,asset.id),rejectsStatus(404));
  assert.equal((await api.findPublicProject(db,'vamps')).artwork,undefined);
  await approve(db,change);
  const project = await api.findPublicProject(db,'vamps'),metadata = api.projectMetadata(project);
  assert.equal(project.cover,'/media/project-artwork/' + asset.id);
  assert.equal(project.artwork.banner.id,asset.id);
  assert.equal(api.shareCardPlan(project).art,project.cover);
  assert.match(metadata.openGraph.images[0].url,/^https:\/\/rmtlaunch\.fun\/media\/share-card\/vamps\?v=4-/);
  assert.equal(metadata.openGraph.images[0].width,1200); assert.equal(metadata.openGraph.images[0].height,630);
  assert.equal(metadata.openGraph.images[0].type,'image/png');
  assert.equal(metadata.twitter.images[0].url,metadata.openGraph.images[0].url);
  const publicJSON = JSON.stringify({project,metadata});
  for (const value of [user.userId,user.email,row.digest,'object_key','ownership_revision']) assert.equal(publicJSON.includes(value),false,value);
  const response = await api.artworkResponse(store,await api.publicArtworkRow(db,asset.id));
  assert.equal(response.headers.get('Content-Type'),'image/png'); assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  const served = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(await sharp(served).raw().toBuffer(),await sharp(bannerBytes).raw().toBuffer());
  assert.equal(served.length,row.byte_size);
});

test('both artwork fields independently reject other projects, wrong image roles and another manager’s private image',async t => {
  const db = database(t),store = bucket(); own(db); own(db,secondId);
  const other = await upload(db,store,'logo',secondId);
  const logo = await upload(db,store,'logo');
  const banner = await upload(db,store);
  await assert.rejects(api.createProjectEdit(db,user,edit('vamps',0,{logoAssetId: other.id,bannerAssetId: banner.id})),rejectsStatus(404));
  await assert.rejects(api.createProjectEdit(db,user,edit('vamps',0,{logoAssetId: logo.id,bannerAssetId: other.id})),rejectsStatus(404));
  await assert.rejects(api.createProjectEdit(db,user,edit('vamps',0,{bannerAssetId: logo.id})),rejectsStatus(404));
  db.raw.prepare("UPDATE project_owners SET user_id='new-owner',revision=2 WHERE project_id='vamps'").run();
  await assert.rejects(api.createProjectEdit(db,{...user,userId: 'new-owner'},edit('vamps',0,{bannerAssetId: banner.id})),rejectsStatus(404));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_edits').get().n,0);
});

test('an approved replacement logo supplies art for the composed share card',async t => {
  const db = database(t),store = bucket(); own(db);
  const logo = await upload(db,store,'logo');
  await approve(db,await api.createProjectEdit(db,user,edit('vamps',0,{logoAssetId: logo.id})));
  const project = await api.findPublicProject(db,'vamps');
  assert.equal(project.artwork.logo.id,logo.id);
  assert.equal(project.artwork.banner,undefined);
  assert.equal(project.cover,api.publicArtworkPath(logo.id));
  assert.equal(project.coverFit,'contain');
  assert.equal(api.shareCardPlan(project).kind,'composed');
  assert.equal(api.shareCardPlan(project).art,project.cover);
});

test('approval rechecks asset readiness and fresh manager revision inside the publication batch',async t => {
  const db = database(t),store = bucket(); own(db);
  const asset = await upload(db,store);
  const change = await api.createProjectEdit(db,user,edit('vamps',0,{bannerAssetId: asset.id}));
  db.raw.prepare("UPDATE project_artwork SET status='failed' WHERE id=?").run(asset.id);
  await assert.rejects(approve(db,change),rejectsStatus(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_overrides').get().n,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM edit_review_events').get().n,0);
  db.raw.prepare("UPDATE project_artwork SET status='ready' WHERE id=?").run(asset.id);
  db.raw.prepare("UPDATE project_owners SET revision=2 WHERE project_id='vamps'").run();
  await assert.rejects(approve(db,change),rejectsStatus(409));
  await assert.rejects(api.privateArtworkRow(db,asset.id,user.userId,false),rejectsStatus(404));
  await assert.rejects(api.publicArtworkRow(db,asset.id),rejectsStatus(404));
});

test('submission rechecks an asset in SQL after its initial ownership lookup',async t => {
  const db = database(t),store = bucket(); own(db);
  const asset = await upload(db,store);
  let changed = false;
  const racing = {...db,prepare(sql) {
    const statement = db.prepare(sql);
    if (!sql.startsWith('SELECT * FROM project_artwork WHERE id=? AND project_id=?')) return statement;
    return {bind(...values) {
      const bound = statement.bind(...values);
      return {...bound,async first() { const result = await bound.first(); if (!changed) { changed = true; db.raw.prepare("UPDATE project_artwork SET status='failed' WHERE id=?").run(asset.id); } return result; }};
    }};
  }};
  await assert.rejects(api.createProjectEdit(racing,user,edit('vamps',0,{bannerAssetId: asset.id})),rejectsStatus(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM project_edits').get().n,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n,0);
});

test('a new manager can keep currently approved artwork but cannot revive the previous manager’s private uploads',async t => {
  const db = database(t),store = bucket(); own(db);
  const published = await upload(db,store),privateAsset = await upload(db,store);
  await approve(db,await api.createProjectEdit(db,user,edit('vamps',0,{bannerAssetId: published.id})));
  const successor = {...user,userId: 'successor'};
  db.raw.prepare("UPDATE project_owners SET user_id=?,revision=2 WHERE project_id='vamps'").run(successor.userId);
  await assert.rejects(api.createProjectEdit(db,successor,edit('vamps',1,{bannerAssetId: privateAsset.id})),rejectsStatus(404));
  const retained = await api.createProjectEdit(db,successor,edit('vamps',1));
  assert.equal(retained.bannerAssetId,published.id);
  await approve(db,retained);
  assert.equal((await api.publicArtworkRow(db,published.id)).id,published.id);
  await assert.rejects(api.publicArtworkRow(db,privateAsset.id),rejectsStatus(404));
});

test('replacing or removing an approved banner invalidates its old URL and changes social metadata',async t => {
  const db = database(t),store = bucket(); own(db);
  const first = await upload(db,store),second = await upload(db,store);
  await approve(db,await api.createProjectEdit(db,user,edit('vamps',0,{bannerAssetId: first.id})));
  const firstCard=api.projectSocialImagePath(await api.findPublicProject(db,'vamps'));
  await approve(db,await api.createProjectEdit(db,user,edit('vamps',1,{bannerAssetId: second.id})));
  await assert.rejects(api.publicArtworkRow(db,first.id),rejectsStatus(404));
  const replacement=api.shareCardPlan(await api.findPublicProject(db,'vamps'));
  assert.equal(replacement.art,api.publicArtworkPath(second.id));
  assert.notEqual(replacement.path,firstCard);
  await approve(db,await api.createProjectEdit(db,user,edit('vamps',2,{bannerAssetId: null})));
  await assert.rejects(api.publicArtworkRow(db,second.id),rejectsStatus(404));
  assert.equal(api.projectSocialImagePath(await api.findPublicProject(db,'vamps')),`/social/vamps-${api.SOCIAL_IMAGE_VERSION}.jpg`);
});

test('concurrent uploads reserve at most eight per verified account in 24 hours',async t => {
  const db = database(t),store = bucket(); own(db);
  const outcomes = await Promise.allSettled(Array.from({length: 10},() => upload(db,store,'logo')));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length,8);
  for (const failure of outcomes.filter(result => result.status === 'rejected')) assert.equal(failure.reason.status,429);
  assert.equal(store.objects.size,8);
  assert.equal((await api.ownerArtwork(db,user,'vamps')).length,8);
});

test('ownership revocation during R2 storage prevents readiness and removes the object',async t => {
  const db = database(t),store = bucket(); own(db);
  const put = store.put;
  store.put = async (...args) => { await put(...args); db.raw.prepare("UPDATE project_owners SET status='revoked',revision=2 WHERE project_id='vamps'").run(); };
  await assert.rejects(upload(db,store),rejectsStatus(409));
  assert.equal(store.objects.size,0);
  assert.equal(db.raw.prepare('SELECT status FROM project_artwork').get().status,'failed');
});

test('a suspended community listing cannot publish pending artwork or expose an approved image',async t => {
  const db = database(t),store = bucket();
  const application = await api.createSubmission(db,user,api.validateSubmission({name: 'Artwork Community',summary: 'A community building original browser games and creative tools for everyone.',category: 'Games',website: 'https://artwork-community.dev/',launchUrl: '',xProfile: '',contactEmail: 'builder@example.dev',ownershipEvidence: 'The official website contains my ownership verification code.',companyFax: ''}));
  await api.reviewSubmission(db,'reviewer',application.id,{action: 'approve',expectedRevision: 1,note: 'Confirmed official ownership and links.',confirmedOwnership: true,checkedLinks: true});
  const projectId = 'community-' + application.id;
  const asset = await upload(db,store,'banner',projectId);
  await approve(db,await api.createProjectEdit(db,user,edit(projectId,0,{bannerAssetId: asset.id})));
  const replacement = await upload(db,store,'banner',projectId);
  const pending = await api.createProjectEdit(db,user,edit(projectId,1,{bannerAssetId: replacement.id}));
  await api.reviewSubmission(db,'reviewer',application.id,{action: 'suspend',expectedRevision: 2,note: 'Temporarily removed for review.'});
  await assert.rejects(api.publicArtworkRow(db,asset.id),rejectsStatus(404));
  await assert.rejects(approve(db,pending),rejectsStatus(409));
  await assert.rejects(upload(db,store,'banner',projectId),rejectsStatus(404));
});
