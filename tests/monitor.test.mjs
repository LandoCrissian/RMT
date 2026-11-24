import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const environment = {};
globalThis.__RMT_MONITOR_TEST_ENV__ = environment;
const compiled = await build({
  stdin: {contents: `export * from './lib/server/review-monitor'; export {POST} from './app/mcp/route';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
  plugins: [{name: 'monitor-test-runtime', setup(build) {
    build.onResolve({filter: /^cloudflare:workers$/}, () => ({path: 'test-runtime', namespace: 'test-runtime'}));
    build.onLoad({filter: /.*/, namespace: 'test-runtime'}, () => ({contents: 'export const env = globalThis.__RMT_MONITOR_TEST_ENV__;'}));
  }}],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const migrationFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(migrationFiles.map(file => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')))).join('\n');
const env = {RMT_PUBLIC_URL: 'https://rmt.example/', RMT_ADMIN_USER_IDS: 'reviewer,second-reviewer'};
const now = 1_800_000_000_000;

function database(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON;');
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
  const db = {
    prepare, raw: sqlite,
    batch(statements) {
      const result = batches.then(async () => {
        sqlite.exec('BEGIN');
        try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
        catch (error) { sqlite.exec('ROLLBACK'); throw error; }
      });
      batches = result.catch(() => {});
      return result;
    },
  };
  t.after(() => sqlite.close());
  for (const key of Object.keys(environment)) delete environment[key];
  Object.assign(environment, env, {DB: db});
  return db;
}

function seed(db, kind, id, extra = {}) {
  const base = {id, user_id: 'builder', status: 'pending', revision: 1, created_at: now, updated_at: now};
  const rows = {
    submission: {table: 'submissions', values: {...base, account_email: 'private@builder.example', name: `Project ${id}`, normalized_name: id,
      summary: 'PRIVATE draft description', category: 'Games', website: `https://${id}.example/`, normalized_host: `${id}.example`, launch_url: `https://${id}.example/play`,
      x_profile: '', ownership_evidence: 'PRIVATE ownership evidence', verification_code: 'PRIVATE-CODE', ...extra}},
    claim: {table: 'project_claims', values: {...base, project_id: 'vamps', project_name: `Project ${id}`, account_email: 'private@builder.example', method: 'website',
      official_channel_url: 'https://vamps.wtf/', verification_code: 'PRIVATE-CLAIM-CODE', proof_url: 'https://vamps.wtf/private-proof', expires_at: now + 86_400_000, ...extra}},
    edit: {table: 'project_edits', values: {...base, project_id: id, project_name: `Project ${id}`, ownership_revision: 1, base_revision: 0, payload_json: '{"private":"proposal"}', ...extra}},
  };
  const {table, values} = rows[kind];
  db.raw.prepare(`INSERT INTO ${table} (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`).run(...Object.values(values));
  return `${kind}:${id}:revision:${values.revision}:pending`;
}

function request(method, params, userId = null, extra = {}) {
  const headers = {'content-type': 'application/json', ...extra};
  if (userId) Object.assign(headers, {'oai-authenticated-user-id': userId, 'oai-authenticated-user-email': 'private-reviewer@example.com'});
  return new Request('https://rmt.example/mcp', {method: 'POST', headers, body: JSON.stringify({jsonrpc: '2.0', id: 'test-1', method, ...(params ? {params} : {})})});
}
async function call(name, args = {}, user = 'reviewer', headers) {
  const response = await api.POST(request('tools/call', {name, arguments: args}, user, headers));
  const body = await response.json();
  return {response, body, result: body.result, data: body.result && !body.result.isError ? JSON.parse(body.result.content[0].text) : null};
}

test('MCP discovery exposes schemas without requiring private data or an identity', async () => {
  const discovered = await (await api.POST(request('server/discover'))).json();
  assert.deepEqual(discovered.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(discovered.result.capabilities, {tools: {}});
  const response = await api.POST(request('tools/list'));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const listed = await response.json();
  assert.deepEqual(listed.result.tools.map(item => item.name), ['rmt_identity', 'rmt_review_digest', 'rmt_acknowledge_review_alerts']);
  assert.equal(JSON.stringify(listed).includes('private-reviewer'), false);
  assert.equal(listed.result.tools[2].annotations.readOnlyHint, false);
});

test('identity tool returns only the caller reference and never grants reviewer access', async t => {
  database(t);
  assert.equal((await call('rmt_identity', {}, null)).result.isError, true);
  const account = await call('rmt_identity', {}, 'visitor', {'oai-authenticated-user-full-name': 'Builder%20Name', 'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8'});
  assert.deepEqual(account.data, {userId: 'visitor', displayName: 'Builder Name', isReviewer: false});
  assert.equal(JSON.stringify(account.body).includes('private-reviewer@example.com'), false);
  assert.equal((await call('rmt_identity', {userId: 'reviewer'}, 'visitor')).result.isError, true);
  assert.equal((await call('rmt_identity')).data.isReviewer, true);
});

test('review tools require exact server allowlist and ignore client admin claims', async t => {
  const db = database(t); seed(db, 'submission', 'private-application');
  assert.equal((await call('rmt_review_digest', {}, null)).result.isError, true);
  const outsider = await call('rmt_review_digest', {}, 'visitor', {'x-is-admin': 'true'});
  assert.equal(outsider.result.isError, true);
  assert.equal(JSON.stringify(outsider.body).includes('private-application'), false);
  assert.equal((await call('rmt_acknowledge_review_alerts', {eventKeys: ['submission:private-application:revision:1:pending']}, 'visitor')).result.isError, true);
  environment.RMT_ADMIN_USER_IDS = '';
  assert.equal((await call('rmt_review_digest')).result.isError, true);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_alert_receipts').get().count, 0);
});

test('digest joins all pending kinds without exposing private application or proof fields', async t => {
  const db = database(t);
  seed(db, 'edit', 'edit-one', {updated_at: now + 2});
  seed(db, 'claim', 'claim-one', {updated_at: now + 1});
  seed(db, 'submission', 'application-one');
  seed(db, 'submission', 'already-approved', {status: 'approved'});
  seed(db, 'claim', 'draft-claim', {status: 'draft'});
  const result = await call('rmt_review_digest');
  assert.equal(result.result.isError, false);
  assert.equal(result.data.reviewUrl, 'https://rmt.example/#review');
  assert.equal(result.data.pendingCount, 3);
  assert.equal(result.data.newPendingCount, 3);
  assert.equal(result.data.moreAvailable, false);
  assert.deepEqual(result.data.items.map(item => item.kind), ['submission', 'claim', 'edit']);
  for (const value of ['private@builder', 'PRIVATE', 'private-proof', 'payload_json', 'already-approved', 'draft-claim']) assert.equal(JSON.stringify(result.data).includes(value), false);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_alert_receipts').get().count, 0);
  assert.equal((await api.reviewDigest(db, 'reviewer', env)).items.length, 3);
});

test('acknowledgement persists exact reviewer receipts without changing review decisions', async t => {
  const db = database(t);
  const first = seed(db, 'submission', 'first');
  seed(db, 'claim', 'second');
  const result = await call('rmt_acknowledge_review_alerts', {eventKeys: [first, first]});
  assert.deepEqual(result.data, {acknowledgedCount: 1, unchangedCount: 0, reviewDecisionsChanged: false});
  assert.equal(db.raw.prepare("SELECT status FROM submissions WHERE id='first'").get().status, 'pending');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_events').get().count, 0);
  const repeat = await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: [first]});
  assert.equal(repeat.acknowledgedCount, 0);
  assert.equal((await api.reviewDigest(db, 'reviewer', env)).newPendingCount, 1);
  assert.equal((await api.reviewDigest(db, 'second-reviewer', env)).newPendingCount, 2);
});

test('stale receipts cannot hide a new revision or mark reviewed records as notified', async t => {
  const db = database(t);
  const old = seed(db, 'submission', 'resubmitted');
  await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: [old]});
  db.raw.prepare("UPDATE submissions SET revision=3, updated_at=? WHERE id='resubmitted'").run(now + 2);
  const next = await api.reviewDigest(db, 'reviewer', env);
  assert.equal(next.items[0].eventKey, 'submission:resubmitted:revision:3:pending');
  const stale = await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: [old]});
  assert.equal(stale.acknowledgedCount, 0);
  assert.equal((await api.reviewDigest(db, 'reviewer', env)).newPendingCount, 1);
  db.raw.exec("UPDATE submissions SET status='approved',revision=4 WHERE id='resubmitted'");
  const reviewed = await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: [next.items[0].eventKey]});
  assert.equal(reviewed.acknowledgedCount, 0);
  assert.equal((await api.reviewDigest(db, 'reviewer', env)).pendingCount, 0);
});

test('bounded digests retain unreported items for subsequent batches', async t => {
  const db = database(t);
  for (let index = 0; index < 55; index++) seed(db, 'submission', `batch-${index}`, {updated_at: now + index});
  const first = await api.reviewDigest(db, 'reviewer', env);
  assert.equal(first.items.length, 50);
  assert.equal(first.newPendingCount, 55);
  assert.equal(first.moreAvailable, true);
  await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: first.items.map(item => item.eventKey)});
  const second = await api.reviewDigest(db, 'reviewer', env);
  assert.equal(second.items.length, 5);
  assert.equal(second.moreAvailable, false);
  assert.equal(second.pendingCount, 55);
  assert.equal(second.newPendingCount, 5);
  assert.equal(first.items.some(item => second.items.some(next => next.eventKey === item.eventKey)), false);
});

test('acknowledgement validates bounded exact arguments and unknown events do nothing', async t => {
  const db = database(t);
  for (const args of [{}, {eventKeys: []}, {eventKeys: ['bad']}, {eventKeys: [12]}, {eventKeys: ['submission:x:revision:1:pending'], approve: true}, {eventKeys: Array(51).fill('submission:x:revision:1:pending')}]) {
    assert.equal((await call('rmt_acknowledge_review_alerts', args)).result.isError, true);
  }
  const unknown = await api.acknowledgeReviewAlerts(db, 'reviewer', {eventKeys: ['submission:unknown:revision:1:pending']});
  assert.equal(unknown.acknowledgedCount, 0);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_alert_receipts').get().count, 0);
  assert.equal((await call('rmt_review_digest', {userId: 'other'})).result.isError, true);
});

test('MCP rejects cross-origin browsers, malformed JSON, oversized streams and unknown methods', async () => {
  assert.equal((await api.POST(request('tools/list', null, null, {origin: 'https://evil.example'}))).status, 403);
  assert.equal((await api.POST(request('tools/list', null, null, {origin: 'https://rmt.example'}))).status, 200);
  const malformed = await api.POST(new Request('https://rmt.example/mcp', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{bad'}));
  assert.equal((await malformed.json()).error.code, -32700);
  const huge = await api.POST(new Request('https://rmt.example/mcp', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({padding: 'x'.repeat(17000)})}));
  assert.equal(huge.status, 413);
  assert.equal((await (await api.POST(request('unknown/method'))).json()).error.code, -32601);
  const unknownTool = await call('not_a_tool');
  assert.equal(unknownTool.body.error.code, -32602);
});

test('mutating tool notifications without a request ID are refused before any write', async t => {
  const db = database(t);
  const key = seed(db, 'submission', 'not-a-notification');
  const req = new Request('https://rmt.example/mcp', {method: 'POST', headers: {'content-type': 'application/json', 'oai-authenticated-user-id': 'reviewer', 'oai-authenticated-user-email': 'reviewer@example.com'}, body: JSON.stringify({jsonrpc: '2.0', method: 'tools/call', params: {name: 'rmt_acknowledge_review_alerts', arguments: {eventKeys: [key]}}})});
  assert.equal((await api.POST(req)).status, 400);
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS count FROM review_alert_receipts').get().count, 0);
});
