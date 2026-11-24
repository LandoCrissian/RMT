import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const routeEnvironment = {};
globalThis.__RMT_LIBRARY_TEST_ENV__ = routeEnvironment;
const compiled = await build({
  stdin: {contents: `export * from './lib/server/library'; export {InputError} from './lib/submission-validation'; export {GET} from './app/api/library/route'; export {PUT,DELETE} from './app/api/library/[projectId]/route'; export {POST} from './app/api/library/import/route';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
  plugins: [{name: 'library-test-runtime', setup(build) {
    build.onResolve({filter: /^cloudflare:workers$/}, () => ({path: 'test-runtime', namespace: 'test-runtime'}));
    build.onLoad({filter: /.*/, namespace: 'test-runtime'}, () => ({contents: 'export const env = globalThis.__RMT_LIBRARY_TEST_ENV__;'}));
  }}],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const sqlFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(sqlFiles.map(file => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')))).join('\n');

function database(t, filename = ':memory:', initialize = true) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (initialize) sqlite.exec(schema);
  let closed = false;
  function prepare(sql, values = []) {
    return {
      bind(...params) { return prepare(sql, params); },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...values), meta: {changes: 0}}; },
      async run() { const result = sqlite.prepare(sql).run(...values); return {success: true, results: [], meta: {changes: Number(result.changes)}}; },
    };
  }
  const db = {prepare, raw: sqlite, close() { if (!closed) {closed = true; sqlite.close();} }};
  t.after(() => db.close());
  return db;
}
function rejection(status) { return error => error instanceof api.InputError && error.status === status; }
function seedCommunity(db, id, status) {
  db.raw.prepare(`INSERT INTO submissions (id,user_id,account_email,name,normalized_name,summary,category,stage,website,
    normalized_host,launch_url,x_profile,contact_email,ownership_evidence,verification_code,status,review_note,revision,created_at,updated_at)
    VALUES (?, 'builder', 'private@example.com', ?, ?, 'A community experience created by an independent builder.', 'Games', 'building', ?, ?, ?, '', '', 'private proof', 'private code', ?, '', 1, 1, 1)`)
    .run(id, id, id, `https://${id}.example/`, `${id}.example`, `https://${id}.example/`, status);
}
function fillLibrary(db, userId, count) {
  for (let index = 0; index < count; index++) {
    db.raw.prepare('INSERT INTO saved_projects (user_id,project_id,created_at) VALUES (?,?,?)').run(userId, `unavailable-${index}`, index);
  }
}
function request(method, {body = {}, userId = 'reader', expectedUserId = userId, origin = 'https://rmt.example', authenticated = true, path = '/api/library/vamps'} = {}) {
  return new Request(`https://rmt.example${path}`, {method,
    headers: {
      ...(method === 'GET' ? {} : {'content-type': 'application/json', origin}),
      ...(authenticated ? {'oai-authenticated-user-id': userId, 'oai-authenticated-user-email': `${userId}@example.com`} : {}),
      ...(expectedUserId === null ? {} : {'X-RMT-Account': expectedUserId}),
    },
    ...(method === 'GET' ? {} : {body: JSON.stringify(body)}),
  });
}
const project = projectId => ({params: Promise.resolve({projectId})});

test('library survives a reopened database and separates users without storing emails', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'rmt-library-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const filename = join(directory, 'rmt.sqlite');
  const first = database(t, filename);
  await api.saveLibraryProject(first, 'reader-one', 'vamps');
  await api.saveLibraryProject(first, 'reader-two', 'lammbs');
  first.close();
  const reopened = database(t, filename, false);
  assert.deepEqual(await api.savedLibrary(reopened, 'reader-one'), {projectIds: ['vamps']});
  assert.deepEqual(await api.savedLibrary(reopened, 'reader-two'), {projectIds: ['lammbs']});
  assert.deepEqual(await api.savedLibrary(reopened, 'reader-three'), {projectIds: []});
  assert.deepEqual(reopened.raw.prepare('PRAGMA table_info(saved_projects)').all().map(row => row.name), ['user_id', 'project_id', 'created_at']);
});

test('repeated saves/removals are idempotent and never affect another account', async t => {
  const db = database(t);
  await Promise.all([api.saveLibraryProject(db, 'first', 'vamps'), api.saveLibraryProject(db, 'first', 'vamps')]);
  await api.saveLibraryProject(db, 'second', 'vamps');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM saved_projects WHERE user_id = ?').get('first').count, 1);
  await api.removeLibraryProject(db, 'first', 'vamps');
  assert.deepEqual(await api.removeLibraryProject(db, 'first', 'vamps'), {projectIds: []});
  assert.deepEqual(await api.savedLibrary(db, 'second'), {projectIds: ['vamps']});
});

test('only current public projects can be saved; suspended entries remain removable', async t => {
  const db = database(t);
  seedCommunity(db, 'visible', 'approved');
  seedCommunity(db, 'private', 'pending');
  await api.saveLibraryProject(db, 'reader', 'community-visible');
  await assert.rejects(api.saveLibraryProject(db, 'reader', 'community-private'), rejection(404));
  await assert.rejects(api.saveLibraryProject(db, 'reader', 'nonexistent'), rejection(404));
  db.raw.prepare("UPDATE submissions SET status = 'suspended' WHERE id = 'visible'").run();
  await assert.rejects(api.saveLibraryProject(db, 'reader', 'community-visible'), rejection(404));
  assert.deepEqual(await api.savedLibrary(db, 'reader'), {projectIds: ['community-visible']});
  assert.deepEqual(await api.removeLibraryProject(db, 'reader', 'community-visible'), {projectIds: []});
});

test('concurrent saves cannot exceed the account cap; an already saved item still succeeds at capacity', async t => {
  const db = database(t);
  fillLibrary(db, 'reader', 199);
  const results = await Promise.allSettled(['vamps', 'lammbs'].map(id => api.saveLibraryProject(db, 'reader', id)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
  const ids = (await api.savedLibrary(db, 'reader')).projectIds;
  assert.equal(ids.length, 200);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM saved_projects WHERE user_id = ?').get('reader').count, 200);
  const saved = ids.find(id => ['vamps', 'lammbs'].includes(id));
  assert.equal((await api.saveLibraryProject(db, 'reader', saved)).projectIds.length, 200);
  assert.deepEqual(await api.saveLibraryProject(db, 'another', 'vamps'), {projectIds: ['vamps']});
});

test('explicit import keeps existing saves, deduplicates, skips unavailable projects, and reports actual inserts', async t => {
  const db = database(t);
  seedCommunity(db, 'private', 'pending');
  await api.saveLibraryProject(db, 'reader', 'vamps');
  const imported = await api.importLibraryProjects(db, 'reader', ['vamps', 'vamps', 'lammbs', 'missing', 'community-private']);
  assert.deepEqual(new Set(imported.projectIds), new Set(['vamps', 'lammbs']));
  assert.equal(imported.importedCount, 1);
  assert.equal(imported.skippedCount, 2);
  const repeat = await api.importLibraryProjects(db, 'reader', ['vamps', 'lammbs']);
  assert.equal(repeat.importedCount, 0);
  assert.equal(repeat.skippedCount, 0);
});

test('bulk import respects remaining capacity inside its write statement', async t => {
  const db = database(t);
  fillLibrary(db, 'reader', 199);
  const result = await api.importLibraryProjects(db, 'reader', ['vamps', 'lammbs', 'suited-apes']);
  assert.equal(result.importedCount, 1);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.projectIds.length, 200);
  assert.ok(result.projectIds.includes('vamps'));
});

test('library input rejects account overrides, malformed IDs, and oversized imports', () => {
  for (const value of [null, [], {}, {projectIds: 'vamps'}, {projectIds: ['vamps'], userId: 'other'}, {projectIds: [1]}, {projectIds: ['../other']}, {projectIds: Array(201).fill('vamps')}]) {
    assert.throws(() => api.validateLibraryImport(value), rejection(400));
  }
  for (const body of [null, [], {userId: 'other'}, {projectIds: ['vamps']}]) assert.throws(() => api.validateLibraryMutation(body), rejection(400));
  for (const id of ['', 'VAMPS', 'a'.repeat(121), "vamps'; DROP TABLE saved_projects;"]) assert.throws(() => api.validateLibraryProjectId(id), rejection(400));
  assert.deepEqual(api.validateLibraryImport({projectIds: []}), []);
});

test('routes require sign-in and same-origin writes, and scope results only to the trusted identity', async t => {
  const db = database(t);
  routeEnvironment.DB = db;
  t.after(() => { delete routeEnvironment.DB; });
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await api[method](request(method, {authenticated: false}), project('vamps'));
    assert.equal(response.status, 401);
  }
  assert.equal((await api.POST(request('POST', {authenticated: false, body: {projectIds: ['vamps']}}))).status, 401);
  assert.equal((await api.PUT(request('PUT', {origin: 'https://elsewhere.example'}), project('vamps'))).status, 403);
  assert.equal((await api.DELETE(request('DELETE', {origin: 'null'}), project('vamps'))).status, 403);
  assert.equal((await api.POST(request('POST', {origin: 'https://elsewhere.example', body: {projectIds: ['vamps']}}))).status, 403);
  assert.equal((await api.PUT(request('PUT', {body: {userId: 'other'}}), project('vamps'))).status, 400);
  const saved = await api.PUT(request('PUT'), project('vamps'));
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {projectIds: ['vamps']});
  const own = await api.GET(request('GET', {path: '/api/library?userId=other'}));
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await own.json(), {projectIds: ['vamps']});
  assert.deepEqual(await (await api.GET(request('GET', {userId: 'other'}))).json(), {projectIds: []});
});

test('database failures surface an error instead of claiming that a save succeeded', async () => {
  delete routeEnvironment.DB;
  const response = await api.PUT(request('PUT'), project('vamps'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(typeof body.error, 'string');
  assert.equal('projectIds' in body, false);
});

test('stale or missing account expectations cannot read, modify, or import into a newly signed-in account', async t => {
  const db = database(t);
  routeEnvironment.DB = db;
  t.after(() => { delete routeEnvironment.DB; });
  await api.saveLibraryProject(db, 'new-account', 'lammbs');
  for (const expectedUserId of ['previous-account', null]) {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const response = await api[method](request(method, {userId: 'new-account', expectedUserId}), project('lammbs'));
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.code, 'account_changed');
      assert.equal('projectIds' in body, false);
    }
    const imported = await api.POST(request('POST', {userId: 'new-account', expectedUserId, body: {projectIds: ['vamps']}}));
    assert.equal(imported.status, 409);
    assert.equal((await imported.json()).code, 'account_changed');
  }
  assert.deepEqual(await api.savedLibrary(db, 'new-account'), {projectIds: ['lammbs']});
  assert.deepEqual(await api.savedLibrary(db, 'previous-account'), {projectIds: []});
  const fresh = await api.GET(request('GET', {userId: 'new-account'}));
  assert.equal(fresh.status, 200);
  assert.deepEqual(await fresh.json(), {projectIds: ['lammbs']});
});
