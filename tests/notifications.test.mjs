import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const routeEnvironment = {};
globalThis.__RMT_NOTIFICATION_TEST_ENV__ = routeEnvironment;
const compiled = await build({
  stdin: {contents: `export * from './lib/server/notifications'; export {GET, POST} from './app/api/admin/notifications/route';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
  plugins: [{name: 'notification-test-runtime', setup(build) {
    build.onResolve({filter: /^cloudflare:workers$/}, () => ({path: 'test-runtime', namespace: 'test-runtime'}));
    build.onLoad({filter: /.*/, namespace: 'test-runtime'}, () => ({contents: 'export const env = globalThis.__RMT_NOTIFICATION_TEST_ENV__;'}));
  }}],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const sqlFiles = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(sqlFiles.map(file => readFile(new URL(`../drizzle/${file}`, import.meta.url), 'utf8')))).join('\n');

function database(t) {
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
  t.after(() => sqlite.close());
  return {prepare, raw: sqlite};
}
const now = 1_800_000_000_000;
const env = {
  RMT_ADMIN_USER_IDS: 'owner', RMT_PUBLIC_URL: 'https://hub.rmt.example/',
  RMT_NOTIFICATION_EMAIL: 'owner@example.com', RMT_EMAIL_FROM: 'RMT <alerts@example.com>', RESEND_API_KEY: 're_test_fake_secret',
  RMT_NOTIFICATION_PHONE: '+15555550123', TWILIO_FROM_NUMBER: '+15555550456', TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'fake-test-token',
};
function seed(db, id, channel, overrides = {}) {
  const row = {id, event_key: `submission:${id}:revision:1:pending`, kind: 'submission', entity_id: id, project_name: 'Test Builders', channel,
    status: 'pending', attempt_count: 0, provider_id: '', last_error: '', payload_json: '', first_attempt_at: null,
    created_at: now, updated_at: now, sent_at: null, ...overrides};
  db.raw.prepare(`INSERT INTO notification_outbox (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}
function row(db, id) { return db.raw.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(id); }
function emailAccepted() { return Response.json({id: '00000000-1111-2222-3333-444444444444'}); }

test('missing configuration retains email without sending and leaves historical SMS disabled', async t => {
  const db = database(t); seed(db, 'email-1', 'email'); seed(db, 'sms-1', 'sms');
  const result = await api.flushNotifications(db, {}, 3, {now: () => now, fetch: () => assert.fail('No HTTP before configuration')});
  assert.deepEqual(result, {attempted: 0, accepted: 0, failed: 0, uncertain: 0, unconfigured: 1});
  assert.equal(row(db, 'email-1').status, 'unconfigured');
  assert.equal(row(db, 'sms-1').status, 'pending');
  assert.equal(row(db, 'sms-1').attempt_count, 0);
  assert.equal(row(db, 'email-1').sent_at, null);
  const report = await api.notificationStatus(db, {}, now);
  assert.equal(report.channels.email.configured, false);
  assert.deepEqual(report.channels.sms, {enabled: false, configured: false, missing: []});
  assert.equal(report.readyCount, 0);
  assert.equal(report.counts.unconfigured, 1);
  assert.equal(report.recent.some(item => item.channel === 'sms'), false);
});

test('trusted HTTPS review URL and reviewer setup are required; recipients never come from a request', () => {
  for (const url of ['http://hub.example', 'https://user:pass@hub.example', 'https://hub.example?approve=1', 'https://hub.example#approve', 'https://localhost', 'https://127.0.0.1', 'https://hub.example:8443']) {
    assert.equal(api.notificationReviewUrl({...env, RMT_PUBLIC_URL: url}), null, url);
  }
  assert.equal(api.notificationReviewUrl(env), 'https://hub.rmt.example/#review');
  assert.equal(api.notificationConfiguration({...env, RMT_ADMIN_USER_IDS: ''}).email.configured, false);
});

test('email uses one immutable provider key; SMS remains disabled even with historical credentials', async t => {
  const db = database(t); seed(db, 'email-1', 'email'); seed(db, 'sms-1', 'sms');
  const calls = [];
  const transport = async (url, options) => { calls.push({url, options}); return emailAccepted(); };
  const result = await api.flushNotifications(db, env, 3, {now: () => now, fetch: transport});
  assert.equal(result.accepted, 1);
  assert.equal(calls.length, 1);
  const email = calls[0];
  assert.equal(email.url, 'https://api.resend.com/emails');
  assert.equal(email.options.headers['Idempotency-Key'], 'rmt-notification/email-1');
  const body = JSON.parse(email.options.body);
  assert.deepEqual(body.to, [env.RMT_NOTIFICATION_EMAIL]);
  assert.equal(body.from, env.RMT_EMAIL_FROM);
  assert.ok(body.text.includes('https://hub.rmt.example/#review'));
  assert.equal(body.text.includes('approve='), false);
  assert.equal(row(db, 'sms-1').status, 'pending');
  assert.equal(row(db, 'sms-1').attempt_count, 0);
  const repeated = await api.flushNotifications(db, env, 3, {now: () => now + 120_000, fetch: transport});
  assert.equal(repeated.attempted, 0);
  assert.equal(calls.length, 1);
  assert.equal(row(db, 'email-1').payload_json.includes(env.RESEND_API_KEY), false);
  const report = await api.notificationStatus(db, env, now);
  assert.equal(report.deliveryConfirmed, false);
  for (const privateValue of [env.RESEND_API_KEY, env.TWILIO_AUTH_TOKEN, env.RMT_NOTIFICATION_EMAIL, env.RMT_NOTIFICATION_PHONE, 'payload_json', 'credentialFingerprint']) assert.equal(JSON.stringify(report).includes(privateValue), false);
});

test('concurrent processors claim each queue item at most once', async t => {
  const db = database(t); seed(db, 'email-race', 'email');
  let calls = 0;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const transport = async () => { calls++; await held; return emailAccepted(); };
  const first = api.flushNotifications(db, env, 3, {now: () => now, fetch: transport});
  const second = api.flushNotifications(db, env, 3, {now: () => now, fetch: transport});
  setTimeout(release, 15);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(row(db, 'email-race').attempt_count, 1);
});

test('email timeout is uncertain without falsely recording acceptance or immediate retry', async t => {
  const db = database(t); seed(db, 'email-timeout-clock', 'email');
  let calls = 0;
  const result = await api.flushNotifications(db, env, 3, {now: () => now, timeoutMs: 2, fetch: async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once: true}));
  }});
  assert.equal(result.uncertain, 1);
  assert.equal(row(db, 'email-timeout-clock').status, 'uncertain');
  assert.equal(row(db, 'email-timeout-clock').sent_at, null);
  await api.flushNotifications(db, env, 3, {now: () => now + 30_000, fetch: () => assert.fail('Wait before retry')});
  assert.equal(calls, 1);
});

test('uncertain email retries reuse the exact body and key inside the retention window', async t => {
  const db = database(t); seed(db, 'email-timeout', 'email');
  const calls = [];
  await api.flushNotifications(db, env, 3, {now: () => now, fetch: async (_url, options) => { calls.push(options); throw new Error('Connection lost'); }});
  assert.equal(row(db, 'email-timeout').status, 'uncertain');
  const changedSettings = {...env, RMT_NOTIFICATION_EMAIL: 'new-owner@example.com', RMT_EMAIL_FROM: 'new-sender@example.com', RMT_PUBLIC_URL: 'https://new-hub.example/'};
  await api.flushNotifications(db, changedSettings, 3, {now: () => now + 61_000, fetch: async (_url, options) => { calls.push(options); return emailAccepted(); }});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(row(db, 'email-timeout').status, 'sent');
});

test('email replay stops after the retention window or when credentials change after uncertainty', async t => {
  const db = database(t); seed(db, 'email-old', 'email'); seed(db, 'email-account', 'email');
  await api.flushNotifications(db, env, 3, {now: () => now, fetch: async () => { throw new Error('Unknown'); }});
  const expired = await api.flushNotifications(db, env, 3, {now: () => now + 23 * 60 * 60 * 1000, fetch: () => assert.fail('Expired key must not be replayed')});
  assert.equal(expired.attempted, 0);
  const changed = await api.flushNotifications(db, {...env, RESEND_API_KEY: 're_different_account'}, 3, {now: () => now + 61_000, fetch: () => assert.fail('Changed credentials must not replay an uncertain email')});
  assert.equal(changed.attempted, 0);
  assert.equal(row(db, 'email-account').last_error, 'provider_configuration_changed');
  assert.equal((await api.notificationStatus(db, env, now + 180_000)).readyCount, 0);
});

test('explicit rejection remains failed, excludes provider response text, and waits before retry', async t => {
  const db = database(t); seed(db, 'email-reject', 'email');
  await api.flushNotifications(db, env, 3, {now: () => now, fetch: async () => Response.json({message: 'private-owner@example.com secret-key'}, {status: 401})});
  assert.equal(row(db, 'email-reject').status, 'failed');
  assert.equal(row(db, 'email-reject').last_error, 'provider_http_401');
  assert.equal(row(db, 'email-reject').last_error.includes('private-owner'), false);
  assert.equal((await api.notificationStatus(db, env, now)).readyCount, 0);
  const result = await api.flushNotifications(db, {...env, RESEND_API_KEY: 're_corrected_key'}, 3, {now: () => now + 61_000, fetch: async () => emailAccepted()});
  assert.equal(result.accepted, 1);
});

test('malformed provider success never becomes a false acceptance', async t => {
  const db = database(t); seed(db, 'email-bad-success', 'email');
  await api.flushNotifications(db, env, 3, {now: () => now, fetch: async () => Response.json({success: true})});
  assert.equal(row(db, 'email-bad-success').status, 'uncertain');
  assert.equal(row(db, 'email-bad-success').sent_at, null);
});

test('processing is bounded at three, and disabled SMS does not block configured email', async t => {
  const db = database(t);
  for (let index = 0; index < 8; index++) seed(db, `email-${index}`, 'email');
  seed(db, 'sms-first', 'sms', {created_at: now - 1000});
  let calls = 0;
  const result = await api.flushNotifications(db, {...env, TWILIO_AUTH_TOKEN: ''}, 100, {now: () => now, fetch: async () => { calls++; return emailAccepted(); }});
  assert.equal(result.attempted, 3);
  assert.equal(calls, 3);
  assert.equal(row(db, 'sms-first').status, 'pending');
  assert.equal((await api.notificationStatus(db, {...env, TWILIO_AUTH_TOKEN: ''}, now)).readyCount, 5);
});

test('interrupted email uses the same safe replay while historical SMS is untouched', async t => {
  const db = database(t); seed(db, 'stale-sms', 'sms'); seed(db, 'stale-email', 'email');
  await api.flushNotifications(db, env, 3, {now: () => now, fetch: async () => { throw new Error('Unknown'); }});
  db.raw.exec("UPDATE notification_outbox SET status = 'sending'");
  const before = await api.notificationStatus(db, env, now + 180_000);
  assert.equal(before.counts.uncertain, 1);
  assert.equal(before.readyCount, 1);
  const result = await api.flushNotifications(db, env, 3, {now: () => now + 180_000, fetch: async url => {
    assert.equal(url.includes('resend'), true);
    return emailAccepted();
  }});
  assert.equal(result.attempted, 1);
  assert.equal(row(db, 'stale-sms').status, 'sending');
  assert.equal(row(db, 'stale-email').status, 'sent');
});

test('admin status and retry routes enforce identity, allowlist, same-origin JSON and a fixed action', async t => {
  const db = database(t); seed(db, 'email-private', 'email');
  for (const key of Object.keys(routeEnvironment)) delete routeEnvironment[key];
  Object.assign(routeEnvironment, {DB: db, RMT_ADMIN_USER_IDS: 'owner'});
  const url = 'https://hub.rmt.example/api/admin/notifications';
  const identity = {'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.com'};
  assert.equal((await api.GET(new Request(url))).status, 401);
  assert.equal((await api.GET(new Request(url, {headers: {...identity, 'oai-authenticated-user-id': 'visitor'}}))).status, 403);
  const status = await api.GET(new Request(url, {headers: identity}));
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('Cache-Control'), 'no-store');
  const statusText = await status.text();
  assert.equal(statusText.includes('owner@example.com'), false);
  assert.equal(statusText.includes('payload_json'), false);
  const request = (body, origin = 'https://hub.rmt.example') => new Request(url, {method: 'POST', headers: {...identity, origin, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  assert.equal((await api.POST(request({action: 'retry'}, 'https://evil.example'))).status, 403);
  assert.equal((await api.POST(request({action: 'retry', recipient: 'attacker@example.com'}))).status, 400);
  assert.equal((await api.POST(request({action: 'approve'}))).status, 400);
  const retry = await api.POST(request({action: 'retry'}));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).result.attempted, 0);
});
