import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile, readdir} from 'node:fs/promises';

const directory = new URL('../drizzle/', import.meta.url);
const files = (await readdir(directory)).filter(file => /^\d.*\.sql$/.test(file)).sort();
const before = files.filter(file => Number(file.slice(0, 4)) <= 6);
const after = files.filter(file => Number(file.slice(0, 4)) > 6);
const read = names => Promise.all(names.map(name => readFile(new URL(name, directory), 'utf8')));
const beforeSql = (await read(before)).join('\n');
const afterSql = (await read(after)).join('\n');
const at = 1_800_000_000_000;
function insert(db, table, values) {
  const keys = Object.keys(values);
  db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...Object.values(values));
}
function rows(db, table) {
  return JSON.parse(JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

test('additive profile migration preserves deployed R11 tables, exact update histories, identity, library and notification retry state', t => {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close()); db.exec('PRAGMA foreign_keys=ON'); db.exec(beforeSql);
  const userId = 'existing-canonical-owner';
  insert(db, 'account_links', {firebase_uid: 'existing-firebase-id', legacy_user_id: userId, created_at: at - 1000});
  insert(db, 'saved_projects', {user_id: userId, project_id: 'vamps', created_at: at - 900});
  insert(db, 'project_owners', {project_id: 'vamps', user_id: userId, status: 'active', revision: 4, created_at: at - 800, updated_at: at - 700});
  const statuses = ['draft', 'pending', 'approved', 'rejected', 'archived'];
  for (const [index, status] of statuses.entries()) {
    const id = `existing-update-${status}`;
    insert(db, 'project_updates', {id, project_id: 'vamps', project_name: 'VAMPS', user_id: userId, ownership_revision: 4,
      kind: 'progress', title: `Existing ${status} update`, body: `The exact ${status} text and private review history must survive.`,
      link_label: 'Project', link_url: 'https://vamps.wtf/', status, review_note: `Existing private ${status} feedback`,
      revision: index + 2, published_at: status === 'approved' || status === 'archived' ? at - 600 : null, created_at: at - 800, updated_at: at - 500 + index});
    insert(db, 'project_update_events', {id: `event-${status}`, update_id: id, actor_id: 'existing-reviewer', action: 'submit',
      previous_status: 'draft', next_status: 'pending', note: `Exact historical event for ${status}`, revision: 2, created_at: at - 650});
  }
  for (const [index, status] of ['pending', 'sending', 'sent', 'failed', 'unconfigured', 'uncertain'].entries()) {
    const eventKey = `update:existing-update-pending:revision:${index + 2}:pending`;
    insert(db, 'notification_outbox', {id: `existing-alert-${status}`, event_key: eventKey, kind: 'update', entity_id: 'existing-update-pending',
      project_name: 'VAMPS', channel: 'email', status, attempt_count: index, provider_id: status === 'sent' ? 'original-provider-id' : '',
      last_error: status === 'uncertain' ? 'outcome_unknown' : '',
      payload_json: JSON.stringify({version: 1, channel: 'email', credentialFingerprint: 'original-fingerprint', ambiguous: status === 'uncertain',
        body: {from: 'original@rmt.dev', to: ['reviewer@rmt.dev'], subject: 'Frozen existing notification', text: 'Keep exact bytes\nand retry identity.'}}),
      first_attempt_at: status === 'pending' || status === 'unconfigured' ? null : at - 400, sent_at: status === 'sent' ? at - 300 : null,
      created_at: at - 500, updated_at: at - 250});
    insert(db, 'review_alert_receipts', {reviewer_id: 'existing-reviewer', event_key: eventKey, acknowledged_at: at - 200});
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  const records = Object.fromEntries(tables.map(table => [table, rows(db, table)]));
  const oldDefinitions = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  assert.equal(after.length, 1, 'This release adds a single forward profile migration.');
  db.exec(afterSql);
  for (const table of tables) assert.deepEqual(rows(db, table), records[table], `${table} data must not change`);
  const retained = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all().filter(row => tables.includes(row.tbl_name));
  assert.deepEqual(retained, oldDefinitions, 'Every deployed table and explicit index keeps its exact definition');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('profiles','profile_artwork','profile_events')").get().n, 3);
  for (const table of ['profiles', 'profile_artwork', 'profile_events']) assert.deepEqual(rows(db, table), [], 'No existing person is auto-published or receives a fabricated profile');
  assert.throws(() => insert(db, 'project_updates', {...records.project_updates.find(row => row.status === 'pending'), id: 'duplicate-pending'}), /UNIQUE constraint failed/);
  assert.throws(() => insert(db, 'notification_outbox', {...records.notification_outbox[0], id: 'duplicate-retry'}), /UNIQUE constraint failed/);
  // An old R11 reader still resolves the same account and sees its library.
  const identity = db.prepare('SELECT legacy_user_id FROM account_links WHERE firebase_uid=?').get('existing-firebase-id').legacy_user_id;
  assert.equal(db.prepare('SELECT project_id FROM saved_projects WHERE user_id=?').get(identity).project_id, 'vamps');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM project_updates u JOIN project_owners o ON o.project_id=u.project_id AND o.user_id=u.user_id AND o.revision=u.ownership_revision WHERE o.status='active' AND u.status='approved'").get().n, 1);
});
