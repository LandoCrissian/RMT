import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: {contents: `export * from './lib/submission-validation'; export * from './lib/server/auth'; export * from './lib/server/http'; export * from './lib/server/repository';`, resolveDir: root, loader: 'ts'},
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
  return {
    prepare,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
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
