import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: `export * from './lib/submission-validation'; export * from './lib/server/auth'; export * from './lib/server/http'; export * from './lib/server/repository'; export * from './lib/server/claims'; export * from './lib/server/project-edits'; export * from './lib/server/outbox-events'; export {getSeedProjects} from './lib/catalog';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const sqlFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
assert.ok(sqlFiles.length > 0, 'Generate schema migrations before running tests.');
const schema = (await Promise.all(sqlFiles.map(file => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')))).join('\n');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec(schema);
  function prepare(sql, values = []) {
    return {
      bind(...params) { return prepare(sql, params); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...values), meta: {changes: 0}}; },
      async run() { const result = sqlite.prepare(sql).run(...values); return {success: true, results: [], meta: {changes: Number(result.changes)}}; },
    };
  }
  let batches = Promise.resolve();
  return {
    prepare,
    batch(statements) {
      const result = batches.then(async () => {
        sqlite.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      batches = result.catch(() => {});
      return result;
    },
    raw: sqlite,
    close() { sqlite.close(); },
  };
}
const user = {userId: 'test-owner', email: 'private@rmt.dev', displayName: 'Test Builder'};
function fields(suffix = 'one', changes = {}) {
  return {name: `Test Project ${suffix}`, summary: 'An independent browser game with a working public launch page.', category: 'Games',
    website: `https://${suffix}.rmt.dev/`, launchUrl: `https://${suffix}.rmt.dev/play`, xProfile: 'https://x.com/testproject',
    contactEmail: 'creator@rmt.dev', ownershipEvidence: 'I can place the verification code on my official website.', companyFax: '', ...changes};
}
function input(suffix = 'one', changes = {}) { return api.validateSubmission(fields(suffix, changes)); }
function rejection(status) { return error => error instanceof api.InputError && error.status === status; }
function decision(action, revision, extra = {}) {
  return api.validateDecision({action, expectedRevision: revision, note: 'Checked official project ownership and links.', confirmedOwnership: true, checkedLinks: true, ...extra});
}

test('application cannot choose its publication state, user ID, price, or review flag', () => {
  for (const key of ['status', 'published', 'userId', 'isAdmin', 'spotlight', 'confirmedOwnership']) {
    assert.throws(() => api.validateSubmission({...fields(), [key]: true}), rejection(400));
  }
});

test('URL validation blocks unsafe schemes, IP and local hosts, credentials and custom ports', () => {
  for (const website of ['http://rmt.dev', 'javascript:alert(1)', 'data:text/html,test', 'https://localhost/', 'https://127.1/',
    'https://0x7f000001/', 'https://[::1]/', 'https://private.internal/', 'https://user:pass@rmt.dev/', 'https://rmt.dev:8443/']) {
    assert.throws(() => input('bad', {website}), rejection(400), website);
  }
  assert.equal(api.normalizeHost('https://www.RMT.dev/'), 'rmt.dev');
  assert.equal(api.publicHttpsUrl('https://rmt.dev/play#section', 'URL'), 'https://rmt.dev/play#section');
});

test('body constraints reject honeypot, short evidence, unsupported categories and fake X links', () => {
  for (const changes of [{companyFax: 'filled'}, {ownershipEvidence: 'trust me'}, {summary: 'short'}, {category: 'Anything'},
    {xProfile: 'https://evil.dev/testproject'}, {xProfile: 'https://x.com/testproject/status/123'}, {xProfile: 'https://x.com/home'}]) {
    assert.throws(() => input('bad', changes), rejection(400));
  }
});

test('administrator is an exact server allowlist match and fails closed', () => {
  assert.equal(api.isAdministrator('owner', undefined), false);
  assert.equal(api.isAdministrator('owner', ''), false);
  assert.equal(api.isAdministrator('own', 'owner,another'), false);
  assert.equal(api.isAdministrator('owner', ' owner , another '), true);
  assert.equal(api.isAdministrator(null, 'owner'), false);
});

test('identity needs both platform headers and never uses an admin request header', () => {
  assert.equal(api.identityFromHeaders(new Headers()), null);
  assert.equal(api.identityFromHeaders(new Headers({'oai-authenticated-user-id': 'owner', 'x-is-admin': 'true'})), null);
  const identity = api.identityFromHeaders(new Headers({'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'private@rmt.dev'}));
  assert.equal(identity.displayName, 'Builder');
  assert.equal(identity.userId, 'owner');
});

test('mutations require exact same-origin browser requests and valid JSON', async () => {
  for (const origin of [undefined, 'null', 'https://evil.dev', 'https://hub.rmt.dev.attacker.dev']) {
    const request = new Request('https://hub.rmt.dev/api/submissions', {method: 'POST', body: '{}', headers: {'content-type': 'application/json', ...(origin ? {origin} : {})}});
    await assert.rejects(api.readMutation(request), rejection(403));
  }
  const valid = new Request('https://hub.rmt.dev/api/submissions', {method: 'POST', body: '{"name":"test"}', headers: {'content-type': 'application/json', origin: 'https://hub.rmt.dev'}});
  assert.deepEqual(await api.readMutation(valid), {name: 'test'});
});

test('large bodies are rejected even without a Content-Length header', async () => {
  const request = new Request('https://hub.rmt.dev/api/submissions', {method: 'POST', body: JSON.stringify({value: 'x'.repeat(17_000)}),
    headers: {'content-type': 'application/json', origin: 'https://hub.rmt.dev'}});
  await assert.rejects(api.readMutation(request), rejection(413));
});

test('new applications remain private pending records, never published by submission', async t => {
  const db = database(); t.after(() => db.close());
  const result = await api.createSubmission(db, user, input());
  assert.equal(result.status, 'pending');
  assert.equal(result.revision, 1);
  assert.match(result.verificationCode, /^rmt-/);
  const publicDirectory = await api.catalog(db);
  assert.equal(publicDirectory.counts.community, 0);
  assert.equal(JSON.stringify(publicDirectory).includes('private@rmt.dev'), false);
  assert.equal(JSON.stringify(publicDirectory).includes(result.verificationCode), false);
});

test('account quota accepts exactly three unique applications per 24 hours', async t => {
  const db = database(); t.after(() => db.close());
  const results = await Promise.allSettled(['one', 'two', 'three', 'four'].map(suffix => api.createSubmission(db, user, input(suffix))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  const failure = results.find(result => result.status === 'rejected');
  assert.equal(failure.reason.status, 429);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM submissions').get().count, 3);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count, 3);
});

test('duplicate name and canonical website are rejected across different accounts', async t => {
  const db = database(); t.after(() => db.close());
  await api.createSubmission(db, user, input());
  const other = {...user, userId: 'other-owner'};
  await assert.rejects(api.createSubmission(db, other, input('another', {website: 'https://www.one.rmt.dev/other'})), rejection(409));
  await assert.rejects(api.createSubmission(db, other, input('another', {name: '  TEST PROJECT ONE  '})), rejection(409));
});

test('existing curated projects cannot be impersonated with a duplicate application', async t => {
  const db = database(); t.after(() => db.close());
  await assert.rejects(api.createSubmission(db, user, input('another', {website: 'https://www.vamps.wtf/'})), rejection(409));
});

test('approval requires affirmative ownership and link checks', () => {
  for (const extra of [{confirmedOwnership: false}, {checkedLinks: false}, {confirmedOwnership: 'true'}, {expectedRevision: undefined}]) {
    assert.throws(() => decision('approve', 1, extra), error => error instanceof api.InputError);
  }
});

test('approved catalog exposes public links but no application or account details', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  const reviewed = await api.reviewSubmission(db, 'admin', created.id, decision('approve', 1));
  assert.equal(reviewed.status, 'approved');
  const publicDirectory = await api.catalog(db);
  assert.equal(publicDirectory.counts.community, 1);
  const project = publicDirectory.projects.find(project => project.source === 'community');
  assert.equal(project.name, created.name);
  assert.equal(project.claimed, true);
  for (const privateField of ['userId', 'accountEmail', 'contactEmail', 'ownershipEvidence', 'verificationCode', 'reviewNote']) assert.equal(privateField in project, false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_events').get().count, 1);
});

test('community claimed status requires an active permission record', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  await api.reviewSubmission(db, 'reviewer', created.id, decision('approve', 1));
  const projectId = 'community-' + created.id;
  db.raw.prepare('DELETE FROM project_owners WHERE project_id=?').run(projectId);
  const project = (await api.catalog(db)).projects.find(row => row.id === projectId);
  assert.equal(project.claimed, false);
});

test('stale review cannot overwrite a decision or create an extra audit record', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  await api.reviewSubmission(db, 'admin', created.id, decision('approve', 1));
  await assert.rejects(api.reviewSubmission(db, 'admin2', created.id, decision('reject', 1)), rejection(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_events').get().count, 1);
  assert.equal(db.raw.prepare('SELECT status FROM submissions').get().status, 'approved');
});

test('suspension removes an approved community listing from public discovery', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  const approved = await api.reviewSubmission(db, 'admin', created.id, decision('approve', 1));
  await api.reviewSubmission(db, 'admin', created.id, decision('suspend', approved.revision));
  assert.equal((await api.catalog(db)).counts.community, 0);
});

test('only owner can read or resubmit requested changes, which returns to pending', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  const requested = await api.reviewSubmission(db, 'admin', created.id, decision('request_changes', 1));
  assert.deepEqual(await api.ownSubmissions(db, 'someone-else'), []);
  await assert.rejects(api.resubmit(db, {...user, userId: 'someone-else'}, created.id, input(), requested.revision), rejection(404));
  const updated = await api.resubmit(db, user, created.id, input('one', {summary: 'An updated browser game with multiplayer racing and a public launch page.'}), requested.revision);
  assert.equal(updated.status, 'pending');
  assert.equal(updated.revision, 3);
  assert.equal(updated.reviewNote, '');
  assert.equal(updated.verificationCode, created.verificationCode);
  assert.equal((await api.catalog(db)).counts.community, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_events').get().count, 2);
});

test('owners cannot edit approved links directly', async t => {
  const db = database(); t.after(() => db.close());
  const created = await api.createSubmission(db, user, input());
  const approved = await api.reviewSubmission(db, 'admin', created.id, decision('approve', 1));
  await assert.rejects(api.resubmit(db, user, created.id, input(), approved.revision), rejection(409));
});

test('failed duplicate resubmission rolls back both edits and its audit event', async t => {
  const db = database(); t.after(() => db.close());
  const first = await api.createSubmission(db, user, input('one'));
  await api.createSubmission(db, user, input('two'));
  const requested = await api.reviewSubmission(db, 'admin', first.id, decision('request_changes', 1));
  await assert.rejects(api.resubmit(db, user, first.id, input('two'), requested.revision), rejection(409));
  const stored = db.raw.prepare('SELECT * FROM submissions WHERE id = ?').get(first.id);
  assert.equal(stored.status, 'needs_changes');
  assert.equal(stored.name, first.name);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_events').get().count, 1);
});


test('a rejected impersonation cannot reserve a project identity against its rightful owner', async t => {
  const db = database(); t.after(() => db.close());
  const fakeOwner = {...user, userId: 'fake-owner', email: 'fake@rmt.dev'};
  const fake = await api.createSubmission(db, fakeOwner, input('rightful'));
  await api.reviewSubmission(db, 'admin', fake.id, decision('reject', fake.revision, {note: 'Applicant did not demonstrate control of the official project.'}));
  const rightful = await api.createSubmission(db, user, input('rightful'));
  assert.notEqual(rightful.id, fake.id);
  assert.equal(rightful.status, 'pending');
  assert.equal((await api.ownSubmissions(db, user.userId)).length, 1);
  assert.equal(db.raw.prepare('SELECT status FROM submissions WHERE id = ?').get(fake.id).status, 'rejected');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM submissions').get().count, 2);
  assert.equal((await api.catalog(db)).counts.community, 0);
  await api.reviewSubmission(db, 'admin', rightful.id, decision('approve', rightful.revision));
  assert.equal((await api.catalog(db)).counts.community, 1);
  // The now-active rightful listing still prevents a third account duplicating it.
  await assert.rejects(api.createSubmission(db, {...user, userId: 'third-owner'}, input('rightful')), rejection(409));
});


test('launch destinations preserve hash routing while website identity remains host based', () => {
  const application = input('hashgame', {website: 'https://www.hashgame.rmt.dev/#home', launchUrl: 'https://hashgame.rmt.dev/#/play?mode=solo'});
  assert.equal(application.launchUrl, 'https://hashgame.rmt.dev/#/play?mode=solo');
  assert.equal(application.website, 'https://www.hashgame.rmt.dev/#home');
  assert.equal(application.normalizedHost, 'hashgame.rmt.dev');
});


test('early builders can start with a website or an X profile and keep their actual stage', async t => {
  const db = database(); t.after(() => db.close());
  const social = input('social', {website:'', launchUrl:'', xProfile:'https://x.com/EarlyCreator', stage:'starting'});
  assert.equal(social.launchUrl, 'https://x.com/EarlyCreator');
  assert.equal(social.normalizedHost, 'x.com/earlycreator');
  const created = await api.createSubmission(db, user, social);
  assert.equal(created.website, '');
  assert.equal(created.stage, 'starting');
  const website = input('webonly', {xProfile:'', launchUrl:'', stage:'building'});
  assert.equal(website.launchUrl, website.website);
  assert.equal(website.xProfile, '');
  await api.createSubmission(db, user, website);
  assert.throws(() => input('none', {website:'',xProfile:'',launchUrl:'https://other.rmt.dev'}), rejection(400));
  assert.throws(() => input('badstage', {stage:'profitable'}), rejection(400));
});

test('separate collection-only projects and separate X-only projects do not collapse into a shared host', async t => {
  const db = database(); t.after(() => db.close());
  const first = input('collectionone', {website:'https://opensea.io/collection/backend-test-one', xProfile:'', launchUrl:''});
  const second = input('collectiontwo', {website:'https://opensea.io/collection/backend-test-two', xProfile:'', launchUrl:''});
  await api.createSubmission(db, user, first);
  await api.createSubmission(db, user, second);
  assert.notEqual(first.normalizedHost,second.normalizedHost);
  const other={...user,userId:'second-builder'};
  await api.createSubmission(db,other,input('socialone',{website:'',launchUrl:'',xProfile:'https://x.com/CreatorOne'}));
  await api.createSubmission(db,other,input('socialtwo',{website:'',launchUrl:'',xProfile:'https://x.com/CreatorTwo'}));
  await assert.rejects(api.createSubmission(db,{...user,userId:'duplicate'},input('differentname',{website:'',xProfile:'https://twitter.com/CREATORONE',launchUrl:''})),rejection(409));
});

function claimDecision(action,revision,extra={}) {
  return api.validateClaimDecision({action,expectedRevision:revision,note:'Reviewed the challenge on the official project channel.',confirmedOwnership:true,...extra});
}
async function submittedClaim(db, claimant=user, projectId='vamps',method='website') {
  const claim=await api.createClaim(db,claimant,{projectId,method});
  const proofUrl=method==='website'?new URL('/rmt-verification.txt',claim.officialChannelUrl).toString():claim.officialChannelUrl;
  return api.submitClaim(db,claimant,claim.id,api.validateClaimProof({proofUrl,note:'The code is on our official page.',expectedRevision:claim.revision}));
}
async function approvedOwner(db,claimant=user,projectId='vamps') {
  const claim=await submittedClaim(db,claimant,projectId);
  return api.reviewClaim(db,'admin',claim.id,claimDecision('approve',claim.revision));
}
function projectEdit(projectId='vamps',baseRevision=0,extra={}) {
  return api.validateProjectEdit({projectId,baseRevision,summary:'Our updated browser experiences and tools are ready to explore.',category:'Games',stage:'building',
    website:'https://vamps.wtf/',launchUrl:'https://games.vamps.wtf/#/play',xProfile:'https://x.com/VampsOnChain',
    links:[{label:'Our games',url:'https://games.vamps.wtf/#/play',type:'Game'}],...extra});
}
function editDecision(action,revision,extra={}) {
  return api.validateEditDecision({action,expectedRevision:revision,note:'Checked the proposed destinations against official project channels.',checkedLinks:true,...extra});
}

test('claim options only expose actual official channels, including collection fallback', async t => {
  const db=database();t.after(()=>db.close());
  const options=await api.claimOptions(db,'lammbs');
  assert.ok(options.methods.some(channel=>channel.method==='website'));
  const collection=options.methods.find(channel=>channel.method==='opensea');
  assert.ok(collection);
  assert.match(collection.channelUrl,/opensea.io\/collection\//);
  const fakeProject={...api.getSeedProjects()[0],website:'',links:[],collections:[{name:'Only collection',url:'https://opensea.io/collection/only-collection'}],launchUrl:'https://opensea.io/collection/only-collection'};
  assert.deepEqual(api.projectClaimMethods(fakeProject).map(channel=>channel.method),['opensea']);
  await assert.rejects(api.claimOptions(db,'missing'),rejection(404));
});

test('draft challenges are random, seven days long, private, and do not send review notifications yet', async t => {
  const db=database();t.after(()=>db.close());
  const claim=await api.createClaim(db,user,{projectId:'vamps',method:'website'});
  assert.equal(claim.status,'draft');
  assert.equal(claim.revision,1);
  assert.equal(claim.expiresAt-claim.createdAt,7*86_400_000);
  assert.match(claim.verificationCode,/^rmt-claim-/);
  assert.deepEqual(await api.ownClaims(db,'other-owner'),[]);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count,0);
  const directory=await api.catalog(db);
  assert.equal(directory.projects.find(project=>project.id==='vamps').claimed,false);
  assert.equal(JSON.stringify(directory).includes(claim.verificationCode),false);
  assert.equal(JSON.stringify(directory).includes(user.email),false);
});

test('claim drafts are rate limited and duplicate own active challenges are rejected', async t => {
  const db=database();t.after(()=>db.close());
  await api.createClaim(db,user,{projectId:'vamps',method:'website'});
  await assert.rejects(api.createClaim(db,user,{projectId:'vamps',method:'website'}),rejection(409));
  await api.createClaim(db,user,{projectId:'lammbs',method:'website'});
  await api.createClaim(db,user,{projectId:'suited-apes',method:'website'});
  db.raw.prepare("UPDATE project_claims SET expires_at=? WHERE project_id='vamps'").run(Date.now()-1);
  await assert.rejects(api.createClaim(db,user,{projectId:'vamps',method:'website'}),rejection(429));
});

test('claim proof must match official channel and be submitted by its owner before expiry', async t => {
  const db=database();t.after(()=>db.close());
  const draft=await api.createClaim(db,user,{projectId:'vamps',method:'website'});
  await assert.rejects(api.submitClaim(db,{...user,userId:'attacker'},draft.id,{proofUrl:'https://vamps.wtf/proof',note:'',expectedRevision:1}),rejection(404));
  await assert.rejects(api.submitClaim(db,user,draft.id,{proofUrl:'https://evil.rmt.dev/proof',note:'',expectedRevision:1}),rejection(400));
  db.raw.prepare('UPDATE project_claims SET expires_at=? WHERE id=?').run(Date.now()-1,draft.id);
  await assert.rejects(api.submitClaim(db,user,draft.id,{proofUrl:'https://vamps.wtf/proof',note:'',expectedRevision:1}),rejection(409));
  assert.equal((await api.ownClaims(db,user.userId))[0].status,'expired');
  assert.equal(api.proofMatchesChannel('x','https://x.com/realproject','https://x.com/fakeproject/status/123'),false);
  assert.equal(api.proofMatchesChannel('x','https://x.com/realproject','https://twitter.com/RealProject/status/123'),true);
  assert.equal(api.proofMatchesChannel('opensea','https://opensea.io/collection/real','https://opensea.io/collection/fake'),false);
});

test('submitting proof queues exactly one email event without automatically approving ownership', async t => {
  const db=database();t.after(()=>db.close());
  const claim=await submittedClaim(db);
  assert.equal(claim.status,'pending');
  assert.equal((await api.catalog(db)).projects.find(project=>project.id==='vamps').claimed,false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count,1);
  await assert.rejects(api.submitClaim(db,user,claim.id,{proofUrl:claim.proofUrl,note:'',expectedRevision:1}),rejection(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count,1);
  assert.throws(()=>claimDecision('approve',claim.revision,{confirmedOwnership:false}),rejection(400));
});

test('competing claims may be reviewed but only one owner can be approved atomically', async t => {
  const db=database();t.after(()=>db.close());
  const first=await submittedClaim(db);
  const secondUser={...user,userId:'other-builder',email:'other@rmt.dev'};
  const second=await submittedClaim(db,secondUser);
  const results=await Promise.allSettled([api.reviewClaim(db,'reviewer-one',first.id,claimDecision('approve',first.revision)),api.reviewClaim(db,'reviewer-two',second.id,claimDecision('approve',second.revision))]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM project_owners WHERE status='active'").get().count,1);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM claim_review_events').get().count,1);
  assert.equal((await api.catalog(db)).projects.find(project=>project.id==='vamps').claimed,true);
});

test('expired pending claims cannot be approved and stale decisions cannot overwrite approval', async t => {
  const db=database();t.after(()=>db.close());
  const claim=await submittedClaim(db);
  db.raw.prepare('UPDATE project_claims SET expires_at=? WHERE id=?').run(Date.now()-1,claim.id);
  await assert.rejects(api.reviewClaim(db,'admin',claim.id,claimDecision('approve',claim.revision)),rejection(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM project_owners').get().count,0);
  db.raw.prepare('UPDATE project_claims SET expires_at=? WHERE id=?').run(Date.now()+86_400_000,claim.id);
  await api.reviewClaim(db,'admin',claim.id,claimDecision('approve',claim.revision));
  await assert.rejects(api.reviewClaim(db,'admin',claim.id,claimDecision('reject',claim.revision)),rejection(409));
});

test('only the approved owner can submit edits; approved community submissions also grant management', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  await assert.rejects(api.createProjectEdit(db,{...user,userId:'outsider'},projectEdit()),rejection(404));
  assert.equal((await api.ownedProjects(db,'outsider')).projects.length,0);
  assert.equal((await api.ownedProjects(db,user.userId)).projects[0].project.id,'vamps');
  const submission=await api.createSubmission(db,user,input('newbuilder'));
  await api.reviewSubmission(db,'admin',submission.id,decision('approve',submission.revision));
  assert.ok((await api.ownedProjects(db,user.userId)).projects.some(row=>row.project.id===`community-${submission.id}`));
});

test('pending owner edits do not alter public project data and never leak through catalog', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  const before=(await api.catalog(db)).projects.find(project=>project.id==='vamps');
  const edit=await api.createProjectEdit(db,user,projectEdit());
  const after=(await api.catalog(db)).projects.find(project=>project.id==='vamps');
  assert.deepEqual(after,before);
  assert.equal(edit.status,'pending');
  assert.equal((await api.ownProjectEdits(db,'outsider')).length,0);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE kind='edit'").get().count,1);
  await assert.rejects(api.createProjectEdit(db,user,projectEdit()),rejection(409));
  assert.throws(()=>api.validateProjectEdit({...projectEdit(),name:'Impersonated project'}),rejection(400));
  assert.throws(()=>api.validateProjectEdit({...projectEdit(),links:[{label:'Unsafe',url:'javascript:alert(1)'}]}),rejection(400));
});

test('approved edits apply public fields while preserving project identity and collection relationships', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  const before=(await api.catalog(db)).projects.find(project=>project.id==='vamps');
  const edit=await api.createProjectEdit(db,user,projectEdit());
  assert.throws(()=>editDecision('approve',edit.revision,{checkedLinks:false}),rejection(400));
  await api.reviewProjectEdit(db,'admin',edit.id,editDecision('approve',edit.revision));
  const after=(await api.catalog(db)).projects.find(project=>project.id==='vamps');
  assert.equal(after.description,edit.summary);
  assert.equal(after.launchUrl,edit.launchUrl);
  assert.equal(after.name,before.name);
  assert.equal(after.slug,before.slug);
  assert.deepEqual(after.collections,before.collections);
  assert.equal((await api.ownedProjects(db,user.userId)).projects[0].revision,1);
  for(const key of ['userId','proofUrl','verificationCode','reviewNote','payloadJson'])assert.equal(key in after,false);
  await assert.rejects(api.createProjectEdit(db,user,projectEdit('vamps',0)),rejection(409));
  const next=await api.createProjectEdit(db,user,projectEdit('vamps',1,{summary:'A second reviewed revision keeps our destinations current for the community.'}));
  await api.reviewProjectEdit(db,'admin',next.id,editDecision('approve',next.revision));
  assert.equal((await api.ownedProjects(db,user.userId)).projects[0].revision,2);
});

test('revoking ownership immediately removes edit access and rejects its outstanding edits', async t => {
  const db=database();t.after(()=>db.close());
  const owner=await approvedOwner(db);
  const edit=await api.createProjectEdit(db,user,projectEdit());
  await api.reviewClaim(db,'admin',owner.id,claimDecision('revoke',owner.revision));
  assert.equal((await api.catalog(db)).projects.find(project=>project.id==='vamps').claimed,false);
  assert.equal((await api.ownedProjects(db,user.userId)).projects.length,0);
  assert.equal((await api.ownProjectEdits(db,user.userId))[0].status,'rejected');
  await assert.rejects(api.reviewProjectEdit(db,'admin',edit.id,editDecision('approve',edit.revision)),rejection(409));
  await assert.rejects(api.createProjectEdit(db,user,projectEdit()),rejection(404));
  const nextUser={...user,userId:'replacement-builder'};
  const next=await submittedClaim(db,nextUser);
  await api.reviewClaim(db,'admin',next.id,claimDecision('approve',next.revision));
  const nextEdit=await api.createProjectEdit(db,nextUser,projectEdit());
  assert.equal(nextEdit.status,'pending');
});

test('a stale owner grant cannot publish an edit even if its edit record still says pending', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  const edit=await api.createProjectEdit(db,user,projectEdit());
  // Simulate a concurrent ownership change immediately before review.
  db.raw.prepare("UPDATE project_owners SET user_id='new-owner',revision=revision+1 WHERE project_id='vamps'").run();
  await assert.rejects(api.reviewProjectEdit(db,'admin',edit.id,editDecision('approve',edit.revision)),rejection(409));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM project_overrides').get().count,0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM edit_review_events').get().count,0);
});

test('review notifications are transactional and idempotent per event and channel', async t => {
  const db=database();t.after(()=>db.close());
  const application=await api.createSubmission(db,user,input('notify'));
  await db.batch(api.pendingNotifications(db,{kind:'submission',id:application.id,projectName:application.name,revision:1,now:Date.now()}));
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count,1);
  const requested=await api.reviewSubmission(db,'admin',application.id,decision('request_changes',1));
  await api.resubmit(db,user,application.id,input('notify'),requested.revision);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM notification_outbox').get().count,2);
});


test('approved X-profile edits are reflected in public destinations even without an extra link row', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  const edit=await api.createProjectEdit(db,user,projectEdit('vamps',0,{xProfile:'https://x.com/NewVampsHandle',links:[]}));
  await api.reviewProjectEdit(db,'admin',edit.id,editDecision('approve',edit.revision));
  const project=(await api.catalog(db)).projects.find(value=>value.id==='vamps');
  assert.ok(project.links.some(link=>link.url==='https://x.com/NewVampsHandle'));
  assert.ok(project.links.some(link=>link.url==='https://vamps.wtf/'));
});

test('known curated collection destinations cannot be duplicated under a different name', async t => {
  const db=database();t.after(()=>db.close());
  const project=api.getSeedProjects().find(value=>value.id==='lammbs');
  const collection=api.projectClaimMethods(project).find(value=>value.method==='opensea');
  await assert.rejects(api.createSubmission(db,user,input('impersonator',{website:collection.channelUrl,xProfile:'',launchUrl:''})),rejection(409));
});


test('a claimed collection-only CannaCats listing can update its description without inventing a website or X', async t => {
  const db=database();t.after(()=>db.close());
  const seed=api.getSeedProjects().find(project=>project.id==='cannacats-v2');
  assert.equal(seed.website,'');
  const claim=await submittedClaim(db,user,'cannacats-v2','opensea');
  await api.reviewClaim(db,'admin',claim.id,claimDecision('approve',claim.revision));
  const proposed=projectEdit('cannacats-v2',0,{summary:'An updated introduction to our CannaCats art and community experiences.',category:'Community',website:'',xProfile:'',launchUrl:'',links:[]});
  const edit=await api.createProjectEdit(db,user,proposed);
  assert.equal(edit.launchUrl,seed.collections[0].url);
  assert.equal(edit.website,'');
  assert.equal(edit.xProfile,'');
  await api.reviewProjectEdit(db,'admin',edit.id,editDecision('approve',edit.revision));
  const published=(await api.catalog(db)).projects.find(project=>project.id==='cannacats-v2');
  assert.equal(published.description,proposed.summary);
  assert.equal(published.launchUrl,seed.collections[0].url);
  assert.deepEqual(published.collections,seed.collections);
  // A new community builder cannot create this exception by adding a collection link.
  const application=await api.createSubmission(db,user,input('without-anchor'));
  await api.reviewSubmission(db,'admin',application.id,decision('approve',application.revision));
  const attempted=projectEdit(`community-${application.id}`,0,{website:'',xProfile:'',launchUrl:'https://opensea.io/collection/arbitrary',links:[{label:'Claimed collection',url:'https://opensea.io/collection/arbitrary'}]});
  await assert.rejects(api.createProjectEdit(db,user,attempted),rejection(400));
  assert.throws(()=>input('still-required',{website:'',xProfile:'',launchUrl:''}),rejection(400));
});

test('twelve custom owner links survive reopening and a second review alongside automatic website and X links', async t => {
  const db=database();t.after(()=>db.close());
  await approvedOwner(db);
  const original=(await api.ownedProjects(db,user.userId)).projects[0];
  assert.deepEqual(original.editableLinks,original.project.links);
  const customLinks=Array.from({length:12},(_,index)=>({label:`Custom experience ${index+1}`,url:`https://games.vamps.wtf/experience/${index+1}`,type:'Experience'}));
  const first=await api.createProjectEdit(db,user,projectEdit('vamps',0,{links:customLinks}));
  await api.reviewProjectEdit(db,'admin',first.id,editDecision('approve',first.revision));
  const reopened=(await api.ownedProjects(db,user.userId)).projects[0];
  assert.equal(reopened.project.links.length,14);
  assert.equal(reopened.editableLinks.length,12);
  assert.deepEqual(reopened.editableLinks,customLinks);
  const second=await api.createProjectEdit(db,user,projectEdit('vamps',reopened.revision,{links:reopened.editableLinks,summary:'Our description changed while every custom destination stayed intact.'}));
  await api.reviewProjectEdit(db,'admin',second.id,editDecision('approve',second.revision));
  const final=(await api.ownedProjects(db,user.userId)).projects[0];
  assert.deepEqual(final.editableLinks,customLinks);
  assert.equal(final.project.links.length,14);
  assert.equal(final.project.links.at(-1).label,'Custom experience 12');
});

test('typed project addresses support either home independently and optional blanks', () => {
  const cases = [
    ['moneymomos.com', '', '', 'https://moneymomos.com/'],
    ['', 'x.com/moneymomos', '', 'https://x.com/moneymomos'],
    ['moneymomos.com', 'twitter.com/moneymomos', 'play.moneymomos.com', 'https://play.moneymomos.com/'],
    ['  ', '  x.com/moneymomos  ', '  ', 'https://x.com/moneymomos'],
  ];
  for (const [website, xProfile, launchUrl, expected] of cases) {
    const result = input('homes', {website, xProfile, launchUrl, contactEmail: ''});
    assert.equal(result.launchUrl, expected);
    assert.equal(result.website, website.trim() ? 'https://moneymomos.com/' : '');
    assert.equal(result.xProfile, xProfile.trim() ? 'https://x.com/moneymomos' : '');
  }
  for (const [website, xProfile] of [['',''],['bad address',''],['','x.com/a/status/12'],['//wrong.dev',''],['https:///wrong.dev','']]) {
    assert.throws(() => input('invalid', {website, xProfile}), rejection(400));
  }
});

test('an unlisted X-only submission moves from private review to the public catalog', async t => {
  const db = database();
  t.after(() => db.close());
  const submission = await api.createSubmission(db, user, input('money', {
    name: 'Fixture Flock', website: '', launchUrl: '', xProfile: 'x.com/fixtureflock', contactEmail: '',
  }));
  assert.equal(submission.status, 'pending');
  assert.ok((await api.reviewQueue(db)).some(row => row.id === submission.id));
  assert.equal((await api.catalog(db)).projects.some(row => row.name === 'Fixture Flock'), false);
  await api.reviewSubmission(db, 'reviewer', submission.id, decision('approve', 1));
  const published = (await api.catalog(db)).projects.find(row => row.name === 'Fixture Flock');
  assert.equal(published.launchUrl, 'https://x.com/fixtureflock');
});

test('the three expansion listings direct repeat applications to the claim workflow', async t => {
  const db = database();
  t.after(() => db.close());
  for (const [name,handle] of [['MoneyMomos','MoneyMomos'],['WIF Outlaws','RobinWifHat'],['Bored Traders','BoredTrader_CO']]) {
    const application = input('repeat',{name, website:'', launchUrl:'', xProfile:'x.com/'+handle});
    await assert.rejects(api.createSubmission(db,user,application),error=>error.status===409 && /claim this project/i.test(error.message));
  }
});

test('a collection claim on each expansion listing goes to review before ownership is granted', async t => {
  const db = database();
  t.after(() => db.close());
  for (const projectId of ['moneymomos','wif-outlaws','bored-traders']) {
    const claim = await submittedClaim(db,user,projectId,'opensea');
    assert.equal(claim.status,'pending');
    assert.equal((await api.claimOptions(db,projectId)).claimed,false);
  }
  assert.equal((await api.ownedProjects(db,user.userId)).projects.length,0);
});

test('first publication binds the public listing to the applicant and a single approval across concurrent requests',async t=>{
  const db=database();t.after(()=>db.close());
  const original=await api.catalog(db), created=await api.createSubmission(db,user,input('publication'));
  const approvals=await Promise.allSettled(['reviewer-a','reviewer-b'].map(id=>api.reviewSubmission(db,id,created.id,decision('approve',1))));
  assert.equal(approvals.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(approvals.find(r=>r.status==='rejected').reason.status,409);
  const directory=await api.catalog(db), id='community-'+created.id, row=directory.projects.find(p=>p.id===id);
  assert.equal(directory.projects.length,original.projects.length+1);assert.equal(row.slug,'project-'+created.id);assert.equal(row.claimed,true);
  const event=db.raw.prepare("SELECT created_at FROM review_events WHERE submission_id=? AND next_status='approved'").all(created.id);
  assert.equal(event.length,1);assert.equal(row.listedAt,new Date(event[0].created_at).toISOString());
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM project_owners o JOIN submissions s ON o.user_id=s.user_id WHERE s.id=? AND o.project_id=? AND o.status='active'").get(created.id,id).n,1);
  assert.equal((await api.ownedProjects(db,user.userId)).projects[0].project.id,id);
  assert.equal((await api.ownedProjects(db,'unrelated-member')).projects.length,0);
});

test('an existing conflicting manager prevents a first approval, without a partial publication or audit',async t=>{
  const db=database();t.after(()=>db.close());
  const created=await api.createSubmission(db,user,input('conflicting-manager')),id='community-'+created.id;
  db.raw.prepare("INSERT INTO project_owners(project_id,user_id,status,revision,created_at,updated_at) VALUES(?,'other-manager','active',1,1,1)").run(id);
  await assert.rejects(api.reviewSubmission(db,'reviewer',created.id,decision('approve',1)),rejection(409));
  assert.equal(db.raw.prepare('SELECT status FROM submissions WHERE id=?').get(created.id).status,'pending');
  assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM review_events WHERE submission_id=?').get(created.id).n,0);
  assert.equal(db.raw.prepare('SELECT user_id FROM project_owners WHERE project_id=?').get(id).user_id,'other-manager');
  assert.equal((await api.catalog(db)).projects.some(p=>p.id===id),false);
});

test('restoring a suspended listing preserves a legitimately transferred active manager',async t=>{
  const db=database();t.after(()=>db.close());const created=await api.createSubmission(db,user,input('restore-owner')),id='community-'+created.id;
  const approved=await api.reviewSubmission(db,'reviewer',created.id,decision('approve',1));
  const suspended=await api.reviewSubmission(db,'reviewer',created.id,decision('suspend',approved.revision));
  db.raw.prepare("UPDATE project_owners SET user_id='new-manager',revision=revision+1 WHERE project_id=?").run(id);
  await api.reviewSubmission(db,'reviewer',created.id,decision('approve',suspended.revision));
  assert.equal((await api.ownedProjects(db,'new-manager')).projects[0].project.id,id);
  assert.equal((await api.ownedProjects(db,user.userId)).projects.length,0);
});

test('builder classifications require review and the administrator-approved selection publishes atomically',async t=>{
 const db=database();t.after(()=>db.close());
 const sub=await api.createSubmission(db,user,input('classified',{categoryIds:['gaming','nft']}));
 assert.deepEqual(sub.categoryIds,['gaming','nft']);
 assert.equal((await api.catalog(db)).projects.some(p=>p.id==='community-'+sub.id),false);
 await assert.rejects(api.reviewSubmission(db,'admin',sub.id,decision('approve',1,{categoryIds:['missing']})),rejection(409));
 await api.reviewSubmission(db,'admin',sub.id,decision('approve',1,{categoryIds:['nft','apps']}));
 const project=(await api.catalog(db)).projects.find(p=>p.id==='community-'+sub.id);
 assert.equal(project.classification.primary,'nft');
 assert.deepEqual(project.classification.secondary,['apps']);
 assert.equal(project.claimed,true);
});
