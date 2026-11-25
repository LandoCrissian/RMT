import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = {};
globalThis.__RMT_ACTIVITY_TEST_ENV__ = environment;
const bundle = await build({stdin: {contents: `
  export * from './lib/server/weekly-digest'; export * from './lib/weekly-digest'; export {GET as previewDigest} from './app/api/discovery/weekly-digest/route';
  export * from './lib/server/discovery'; export {GET as discover,POST as modify} from './app/api/discovery/route'; export * from './lib/activity'; export * from './lib/server/activity';
  export * from './lib/client/activity'; export {getSeedProjects} from './lib/catalog';
  export {InputError} from './lib/submission-validation';
  export {GET} from './app/api/activity/route';
`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false,
  platform: 'node', format: 'esm', target: 'node24', plugins: [{name: 'activity-test-runtime', setup(build) {
    build.onResolve({filter: /^cloudflare:workers$/}, () => ({path: 'test-runtime', namespace: 'test-runtime'}));
    build.onLoad({filter: /.*/, namespace: 'test-runtime'}, () => ({contents: 'export const env=globalThis.__RMT_ACTIVITY_TEST_ENV__;'}));
  }}]});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(name => /^\d.*\.sql$/.test(name)).sort();
const schema = (await Promise.all(migrations.map(name => readFile(new URL('../drizzle/' + name, import.meta.url), 'utf8')))).join('\n');
const at = Date.parse('2026-11-24T18:00:00.000Z');
const input = (kind = 'all', limit = 6, cursor = null) => api.validateActivityPage(new URL(`https://rmt.dev/api/activity?kind=${kind}&limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`));
function database(t) {
  const raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=ON;'); raw.exec(schema); t.after(() => raw.close());
  const db = {raw, beforeActivity: null};
  function prepare(sql, values = []) { return {
    bind(...args) {return prepare(sql, args);},
    async first() {return raw.prepare(sql).get(...values) ?? null;},
    async all() {
      if (sql.startsWith('WITH available_projects') && db.beforeActivity) {const action = db.beforeActivity; db.beforeActivity = null; action();}
      return {success: true, results: raw.prepare(sql).all(...values), meta: {changes: 0}};
    },
    async run() {return {success: true, results: [], meta: {changes: Number(raw.prepare(sql).run(...values).changes)}};},
  }; }
  db.prepare = prepare;
  environment.DB = db;
  return db;
}
function insert(db, table, values) {
  const fields = Object.keys(values);
  db.raw.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')})`).run(...Object.values(values));
}
function owner(db, projectId = 'vamps', userId = 'private-owner') {
  insert(db, 'project_owners', {project_id: projectId, user_id: userId, status: 'active', revision: 1, created_at: at, updated_at: at});
}
function update(db, id = 'approved-update', changes = {}) {
  insert(db, 'project_updates', {id, project_id: 'vamps', project_name: 'VAMPS', user_id: 'private-owner', ownership_revision: 1,
    kind: 'progress', title: 'A public development update', body: 'The next part of this project is available to explore.',
    link_label: 'Explore the release', link_url: 'https://vamps.wtf/', status: 'approved', review_note: 'PRIVATE review note',
    revision: 3, published_at: at, created_at: at - 1000, updated_at: at, ...changes});
}
function community(db, id = 'new-project', status = 'approved', publishedAt = at - 2000) {
  insert(db, 'submissions', {id, user_id: 'private-owner', account_email: 'private-account@rmt.dev', name: `New project ${id}`,
    normalized_name: `new project ${id}`, summary: 'An independent project building a new public experience.', category: 'Games', stage: 'building',
    website: `https://${id}.rmt.dev/`, normalized_host: `${id}.rmt.dev`, launch_url: `https://${id}.rmt.dev/play`, x_profile: '',
    contact_email: 'private-contact@rmt.dev', ownership_evidence: 'PRIVATE ownership evidence', verification_code: 'private-proof',
    status, review_note: 'PRIVATE application review', revision: 2, created_at: at - 99_000, updated_at: at});
  if (publishedAt !== null) insert(db, 'review_events', {id: `review-${id}`, submission_id: id, reviewer_id: 'private-reviewer', previous_status: 'pending',
    next_status: 'approved', note: 'PRIVATE decision', revision: 2, created_at: publishedAt});
  return `community-${id}`;
}

test('activity lists only real first listing dates and keeps legacy undated projects out of recency', async t => {
  const db = database(t);
  const page = await api.publicActivity(db, input());
  const known = api.getSeedProjects().filter(project => project.listedAt);
  assert.equal(page.items.length, known.length);
  assert.equal(page.hasMore, false); assert.equal(page.nextCursor, null);
  assert.deepEqual(new Set(page.items.map(item => item.project.id)), new Set(known.map(project => project.id)));
  for (const item of page.items) {
    assert.equal(item.kind, 'listing'); assert.equal(item.title, 'Joined RMT'); assert.equal(item.updateId, null);
    assert.equal(item.publishedAt, Date.parse(known.find(project => project.id === item.project.id).listedAt));
  }
  assert.equal(page.items.some(item => item.project.id === 'vamps'), false);
  assert.deepEqual(api.publicActivityPage(page), page);
});

test('only eligible approved posts enter activity and its projection excludes all private fields', async t => {
  const db = database(t); owner(db);
  update(db);
  for (const status of ['draft', 'pending', 'rejected', 'archived']) update(db, `hidden-${status}`, {status, title: 'PRIVATE unapproved content'});
  update(db, 'missing-publication', {published_at: null});
  update(db, 'unlisted-project', {project_id: 'unlisted'});
  const page = await api.publicActivity(db, input('progress'));
  assert.equal(page.items.length, 1); assert.equal(page.items[0].updateId, 'approved-update');
  assert.deepEqual(Object.keys(page.items[0]).sort(), ['id', 'kind', 'publishedAt', 'project', 'title', 'body', 'linkLabel', 'linkUrl', 'updateId'].sort());
  for (const value of ['PRIVATE', 'private-owner', 'ownership_revision', 'review_note', 'userId', 'canManage', 'account_email']) assert.equal(JSON.stringify(page).includes(value), false, value);
  assert.deepEqual(api.publicActivityPage(page), page);
});

test('archived updates and revoked or replaced ownership immediately stop appearing', async t => {
  const db = database(t); owner(db); update(db);
  assert.equal((await api.publicActivity(db, input('progress'))).items.length, 1);
  db.raw.exec("UPDATE project_updates SET status='archived'");
  assert.equal((await api.publicActivity(db, input('progress'))).items.length, 0);
  db.raw.exec("UPDATE project_updates SET status='approved'; UPDATE project_owners SET status='revoked',revision=2");
  assert.equal((await api.publicActivity(db, input('progress'))).items.length, 0);
  db.raw.exec("UPDATE project_owners SET status='active'");
  assert.equal((await api.publicActivity(db, input('progress'))).items.length, 0, 'Reactivated ownership cannot revive an old ownership revision');
  db.raw.exec("UPDATE project_owners SET user_id='new-owner',revision=1");
  assert.equal((await api.publicActivity(db, input('progress'))).items.length, 0);
});

test('community suspension removes both listing and update; reapproval preserves its first listing date', async t => {
  const db = database(t); const projectId = community(db); owner(db, projectId); update(db, 'community-update', {project_id: projectId});
  community(db, 'pending-project', 'pending'); community(db, 'no-history', 'approved', null);
  let page = await api.publicActivity(db, input('all', 12));
  assert.equal(page.items.filter(item => item.project.id === projectId).length, 2);
  assert.equal(page.items.some(item => item.project.id === 'community-pending-project' || item.project.id === 'community-no-history'), false);
  db.raw.exec("UPDATE submissions SET status='suspended' WHERE id='new-project'");
  assert.equal((await api.publicActivity(db, input('all', 12))).items.some(item => item.project.id === projectId), false);
  db.raw.exec("UPDATE submissions SET status='approved',updated_at=9999999999999 WHERE id='new-project'");
  insert(db, 'review_events', {id: 'second-approval', submission_id: 'new-project', reviewer_id: 'private-reviewer', previous_status: 'suspended',
    next_status: 'approved', note: 'PRIVATE', revision: 4, created_at: at + 5000});
  page = await api.publicActivity(db, input('listing', 12));
  assert.equal(page.items.find(item => item.project.id === projectId).publishedAt, at - 2000);
  for (const value of ['private-account', 'private-contact', 'private-reviewer', 'PRIVATE', 'private-proof']) assert.equal(JSON.stringify(page).includes(value), false);
});

test('publication is rechecked between catalog loading and the final feed query', async t => {
  const db = database(t); const projectId = community(db); owner(db, projectId); update(db, 'race-update', {project_id: projectId});
  db.beforeActivity = () => db.raw.exec("UPDATE submissions SET status='suspended' WHERE id='new-project'");
  const page = await api.publicActivity(db, input('all', 12));
  assert.equal(page.items.some(item => item.project.id === projectId), false);
});

test('mixed-event keyset pages have stable ties, bounded size and no duplicates or omissions', async t => {
  const db = database(t); owner(db);
  const tiedAt = Date.parse(api.getSeedProjects().find(project => project.listedAt).listedAt);
  const projectId = community(db, 'tied-project', 'approved', tiedAt); owner(db, projectId);
  for (let index = 0; index < 15; index++) update(db, `tie-${String(index).padStart(2, '0')}`, {published_at: tiedAt});
  const rows = []; let cursor = null;
  do {
    const page = await api.publicActivity(db, input('all', 2, cursor));
    assert.ok(page.items.length <= 2); assert.equal(page.hasMore, page.nextCursor !== null);
    api.publicActivityPage(page);
    rows.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  const expected = 16 + api.getSeedProjects().filter(project => project.listedAt).length;
  assert.equal(rows.length, expected); assert.equal(new Set(rows.map(item => item.id)).size, expected);
  const ordered = [...rows].sort((a,b) => b.publishedAt - a.publishedAt || b.id.localeCompare(a.id));
  assert.deepEqual(rows.map(item => item.id), ordered.map(item => item.id));
});

test('filtering happens before pagination and cursors cannot cross activity filters', async t => {
  const db = database(t); owner(db);
  for (let index = 0; index < 20; index++) update(db, `new-progress-${index}`, {published_at: at + index});
  for (let index = 0; index < 3; index++) update(db, `older-release-${index}`, {kind: 'release', published_at: at - 1000 + index});
  update(db, 'announcement', {kind: 'announcement'});
  const releases = await api.publicActivity(db, input('release', 2));
  assert.equal(releases.items.length, 2); assert.equal(releases.hasMore, true);
  assert.ok(releases.items.every(item => item.kind === 'release'));
  const final = await api.publicActivity(db, input('release', 2, releases.nextCursor));
  assert.equal(final.items.length, 1); assert.equal(final.hasMore, false);
  assert.equal((await api.publicActivity(db, input('announcement'))).items.length, 1);
  assert.throws(() => input('all', 2, releases.nextCursor), error => error.status === 400);
});

test('activity endpoint stays public and no-store, rejects malformed queries and reports database failures honestly', async t => {
  const db = database(t); owner(db); update(db);
  const request = query => new Request(`https://rmt.dev/api/activity${query ? '?' + query : ''}`);
  const response = await api.GET(request('kind=progress'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).items.length, 1);
  for (const query of ['limit=0', 'limit=13', 'limit=1e1', 'limit=06', 'limit=', 'kind=other', 'kind=all&kind=release', 'cursor=%', 'cursor=e30', 'userId=private-owner']) {
    assert.equal((await api.GET(request(query))).status, 400, query);
  }
  environment.DB = {prepare() {throw new Error('Unavailable database');}};
  const unavailable = await api.GET(request(''));
  assert.equal(unavailable.status, 503); assert.equal('items' in await unavailable.json(), false);
});

test('discovery personalizes only eligible public items and isolates preferences and read receipts',async t=>{
  const db=database(t);owner(db);update(db,'before',{published_at:at-1});
  update(db,'event',{kind:'announcement',is_event:1});update(db,'pending',{status:'pending'});
  insert(db,'project_follows',{project_id:'vamps',user_id:'alice',followed_at:at});
  const load=(view,user=null)=>api.discovery(db,new URL('https://rmt.dev/api/discovery?view='+view),user);
  const inbox=await load('notifications','alice');
  assert.deepEqual(inbox.items.map(i=>[i.updateId,i.kind]),[['event','event']]);assert.equal(inbox.unreadCount,1);
  assert.deepEqual((await load('notifications','bob')).items,[]);
  await assert.rejects(api.changeDiscovery(db,'bob',{action:'read',id:'event'}),e=>e.status===404);
  await api.changeDiscovery(db,'alice',{action:'read',id:'event'});
  const read=await load('notifications','alice');assert.equal(read.unreadCount,0);assert.deepEqual(read.readIds,['event']);
  const following=await load('following','alice');assert.deepEqual(following.items.map(i=>i.updateId),['event','before']);
  assert.deepEqual((await load('for-you','alice')).items.map(i=>i.updateId),['event','before']);
  await api.changeDiscovery(db,'alice',{action:'interests',interests:['Games']});
  assert.deepEqual((await load('guide','alice')).interests,['gaming']);assert.deepEqual((await load('guide','bob')).interests,[]);
  assert.deepEqual((await load('guide')).interests,[]);
  await api.changeDiscovery(db,'alice',{action:'interests',interests:[]});
  await api.changeDiscovery(db,'alice',{action:'notifications',enabled:false});
  const paused=await load('notifications','alice');assert.equal(paused.unreadCount,0);assert.deepEqual(paused.items,[]);
  await api.changeDiscovery(db,'alice',{action:'notifications',enabled:true});
  db.raw.exec("UPDATE project_updates SET status='archived' WHERE id='event'");
  assert.deepEqual((await load('notifications','alice')).items,[]);
  await assert.rejects(api.changeDiscovery(db,'alice',{action:'read',id:'event'}),e=>e.status===404);
  await assert.rejects(load('following'),e=>e.status===401);
  assert.equal((await api.discover(new Request('https://rmt.dev/api/discovery?view=notifications'))).status,401);
  assert.equal((await api.modify(new Request('https://rmt.dev/api/discovery',{method:'POST'}))).status,401);
  await assert.rejects(api.changeDiscovery(db,'alice',{action:'interests',interests:['secret category']}),e=>e.status===400);
});

test('discovery changes require same-origin authenticated requests for the current member',async t=>{
  const db=database(t),url='https://rmt.dev/api/discovery';
  function mutate(account,origin='https://rmt.dev',extra={}){
    return api.modify(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json',
      'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test','x-rmt-account':account},
      body:JSON.stringify({action:'onboarding',outcome:'completed',...extra})}));
  }
  assert.equal((await mutate('bob')).status,409);
  assert.equal((await mutate('alice','https://unrelated.example')).status,403);
  assert.equal((await mutate('alice',undefined,{userId:'bob'})).status,400);
  assert.equal((await mutate('alice')).status,200);
  assert.deepEqual(db.raw.prepare('SELECT user_id FROM discovery_members').all().map(r=>r.user_id),['alice']);
  db.raw.exec("UPDATE control_members SET status='suspended' WHERE user_id='alice'");
  assert.equal((await mutate('alice')).status,403);
});

test('secondary interests surface reviewed updates; category renames preserve private selections',async t=>{
  const db=database(t);
  owner(db);update(db);
  db.raw.exec("INSERT INTO taxonomy_categories(id,name,position) VALUES('music-events','Live music',30); INSERT INTO project_categories VALUES('vamps','music-events',0)");
  await api.changeDiscovery(db,'fan',{action:'interests',interests:['music-events']});
  const load=(view,user=null)=>api.discovery(db,new URL('https://rmt.dev/api/discovery?view='+view),user);
  const feed=await load('for-you','fan');
  assert.equal(feed.recommendedProjects.filter(p=>p.id==='vamps').length,1);
  const item=feed.items.find(i=>i.updateId==='approved-update');
  assert.ok(item?.project.categoryNames.includes('Live music'));
  assert.deepEqual(api.publicActivityPage(feed).items.find(i=>i.updateId==='approved-update').project.categoryNames,item.project.categoryNames);
  db.raw.exec("UPDATE taxonomy_categories SET name='Concerts' WHERE id='music-events'");
  const guide=await load('guide','fan');assert.deepEqual(guide.interests,['music-events']);assert.equal(guide.categoryLabels['music-events'],'Concerts');
  assert.deepEqual((await load('guide')).interests,[]);
  db.raw.exec("DELETE FROM project_categories WHERE category_id='music-events'; UPDATE taxonomy_categories SET archived=1 WHERE id='music-events'");
  assert.deepEqual((await load('guide','fan')).interests,[]);
  await assert.rejects(api.changeDiscovery(db,'fan',{action:'interests',interests:['music-events']}),e=>e.status===400);
  db.raw.exec("UPDATE discovery_members SET interests='[\"Music\"]' WHERE user_id='fan'");
  assert.deepEqual((await load('guide','fan')).interests,['art']);
});

test('legacy editorial interest choices survive taxonomy migration and continue restricting member choices',async t=>{
  const db=database(t);
  const legacy={categories:['Tools','Games'],recommendedIds:[],lessons:[{title:'Start here',body:'Choose your interests.'}]};
  db.raw.prepare("INSERT INTO discovery_config(id,payload_json,revision) VALUES('discovery',?,1)").run(JSON.stringify(legacy));
  db.raw.prepare("INSERT INTO discovery_members(user_id,interests) VALUES('member',?)").run(JSON.stringify(['Games','Community']));
  const guide=await api.discovery(db,new URL('https://rmt.dev/api/discovery?view=guide'),'member');
  assert.deepEqual(guide.categories,['gaming','apps']);assert.deepEqual(guide.interests,['gaming']);
  assert.deepEqual(guide.categoryLabels,{gaming:'Gaming',apps:'Apps & Utilities'});
  await assert.rejects(api.changeDiscovery(db,'member',{action:'interests',interests:['nft']}),e=>e.status===400);
  await assert.rejects(api.changeDiscovery(db,'member',{action:'interests',interests:['Games','gaming']}),e=>e.status===400);
});

test('upcoming events respect discovery scopes, legacy pagination, saved reminders and moderation',async t=>{
  const db=database(t);
  owner(db);update(db,"past-update-one");update(db,"past-update-two");
  const now=Date.now();
  function event(id,project,delta,status='published',hasPublished=true){
    insert(db,'calendar_events',{id,project_id:project,type_id:'community',status,revision:1,
      published:hasPublished?JSON.stringify({title:id,startsAt:now+delta}):null,draft:'{"title":"private draft"}',
      actor:'fixture',created_at:now,updated_at:now,published_at:hasPublished?now:null});
  }
  event('due-followed','vamps',3_600_000);
  event('due-saved','lammbs',1_800_000);
  event('too-early','lammbs',172_800_000);
  event('over','vamps',-100_000);
  event('cancelled','lammbs',1,'cancelled');
  event('hidden','ccff00',1000);
  event('pending','vamps',2,'pending',false);
  db.raw.prepare("INSERT INTO project_controls(project_id,source,visibility,revision,created_at,updated_at) VALUES ('ccff00','existing','hidden',1,?,?)").run(now,now);
  insert(db,'project_follows',{project_id:'vamps',user_id:'fan',followed_at:now});
  await api.changeDiscovery(db,'reader',{action:'interests',interests:['communities']});
  for(const id of ['due-saved','too-early','cancelled','hidden'])insert(db,'calendar_members',{event_id:id,user_id:'fan',reminder:1});
  insert(db,'calendar_members',{event_id:'due-followed',user_id:'fan',reminder:0});
  const feed=(view,user=null,query='')=>api.discovery(db,new URL('https://rmt.dev/api/discovery?view='+view+query),user);
  const ids=page=>(page.calendarEvents??[]).map(e=>e.id);
  const first=await feed('all',null,'&limit=1');
  assert.deepEqual(ids(first),['due-saved','due-followed','too-early']);
  assert.deepEqual(ids(await feed('following','fan')),['due-followed']);
  assert.deepEqual(ids(await feed('for-you','fan')),['due-followed']);
  assert.ok(ids(await feed('for-you','reader')).includes('due-saved'));
  assert.deepEqual(ids(await feed('all',null,'&kind=announcement')),[]);
  assert.ok(first.nextCursor);
  const older=await feed('all',null,'&limit=1&cursor='+first.nextCursor);
  assert.deepEqual(ids(older),[]);assert.notEqual(older.items[0].id,first.items[0].id);
  assert.deepEqual(ids(await feed('notifications','fan')),['due-saved']);
  assert.deepEqual(ids(await feed('notifications','reader')),[]);
  assert.equal(JSON.stringify(first).includes('private draft'),false);
  await api.changeDiscovery(db,'fan',{action:'notifications',enabled:false});
  assert.deepEqual(ids(await feed('notifications','fan')),[]);
});

test('weekly digest enforces moderation, subscription timing, week bounds and account isolation',async t=>{
  const db=database(t);owner(db);
  const week=api.weekMs,now=at+100;
  insert(db,'project_follows',{user_id:'alice',project_id:'vamps',followed_at:at-100});
  update(db,'included');
  update(db,'late',{published_at:now+1});
  update(db,'pre-follow',{published_at:at-1000});
  update(db,'private',{status:'pending',title:'PRIVATE'});
  const newId=community(db,'new-addition','approved',at);
  community(db,'past-addition','approved',now-week-1);
  community(db,'held-addition','pending',at);
  const addEvent=(id,startsAt,status='published',project='vamps')=>insert(db,'calendar_events',{
    id,project_id:project,type_id:'community',status,revision:1,created_at:at,updated_at:at,actor:'private',
    draft:'{"title":"PRIVATE"}',published:JSON.stringify({title:id,startsAt}),published_at:at});
  addEvent('in-window',now+week);
  addEvent('later',now+week+1);
  addEvent('cancelled',now+100,'cancelled');
  addEvent('other-project',now+1,'published','lammbs');
  const digest=await api.weeklyDigest(db,'alice',now);
  assert.deepEqual(digest.updates.map(r=>r.id),['update-included']);
  assert.deepEqual(digest.events.map(r=>r.id),['in-window']);
  assert.ok(digest.additions.some(r=>r.id==='listing-'+newId));
  assert.ok(!JSON.stringify(digest).includes('PRIVATE'));
  assert.ok(!JSON.stringify(digest).includes('past-addition'));
  const other=await api.weeklyDigest(db,'bob',now);
  assert.deepEqual(other.updates,[]);assert.deepEqual(other.events,[]);assert.deepEqual(other.additions,digest.additions);
  assert.deepEqual(await api.weeklyDigest(db,'alice',now),digest);
  assert.match(api.digestText(digest),/https:\/\/rmtlaunch\.fun\/events\/in-window/);
  assert.throws(()=>api.digestEntryUrl('//invalid.example/'));
  assert.throws(()=>api.digestEntryUrl('javascript:invalid'));
  db.raw.exec("UPDATE project_updates SET status='archived' WHERE id='included'");
  assert.deepEqual((await api.weeklyDigest(db,'alice',now)).updates,[]);
});

test('weekly preview enforces verified account and no-store responses without sending mail',async t=>{
  const db=database(t),url='https://rmt.dev/api/discovery/weekly-digest';
  assert.equal((await api.previewDigest(new Request(url))).status,401);
  function request(id){return new Request(url,{headers:{'oai-authenticated-user-id':'alice','oai-authenticated-user-email':'alice@example.test','x-rmt-account':id}});}
  assert.equal((await api.previewDigest(request('bob'))).status,409);
  const response=await api.previewDigest(request('alice'));
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  db.raw.exec("UPDATE control_members SET status='suspended' WHERE user_id='alice'");
  assert.equal((await api.previewDigest(request('alice'))).status,403);
  assert.equal(db.raw.prepare("SELECT count(*) n FROM notification_outbox").get().n,0);
});
