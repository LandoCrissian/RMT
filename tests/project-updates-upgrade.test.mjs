import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';

const directory = new URL('../drizzle/', import.meta.url);
const migrationFiles = (await readdir(directory)).filter(file => /^\d.*\.sql$/.test(file)).sort();
const beforeUpdates = migrationFiles.filter(file => Number(file.slice(0, 4)) <= 5);
const updateMigrations = migrationFiles.filter(file => Number(file.slice(0, 4)) > 5);
const readMigrations = files => Promise.all(files.map(file => readFile(new URL(file, directory), 'utf8')));
const beforeSchema = (await readMigrations(beforeUpdates)).join('\n');
const upgradeSchema = (await readMigrations(updateMigrations)).join('\n');
const now = 1_800_000_000_000;
const owner = 'fixture-legacy-owner';

function insert(db, table, values) {
  const keys = Object.keys(values);
  db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(values));
}

function snapshot(db, table) {
  return JSON.parse(JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function seedExistingData(db) {
  insert(db, 'submissions', {
    id: 'existing-community', user_id: owner, account_email: 'fixture-owner@rmt.example', name: 'Existing community',
    normalized_name: 'existing community', summary: 'An existing approved community with private review history.', category: 'Community',
    stage: 'building', website: 'https://existing.rmt.example/', normalized_host: 'existing.rmt.example',
    launch_url: 'https://existing.rmt.example/play', x_profile: '', contact_email: 'fixture-team@rmt.example',
    ownership_evidence: 'Existing private ownership evidence', verification_code: 'fixture-existing-proof',
    status: 'approved', review_note: 'Approved before the updates feature.', revision: 2, created_at: now - 2000, updated_at: now - 1500,
  });
  insert(db, 'review_events', {
    id: 'existing-publication', submission_id: 'existing-community', reviewer_id: 'fixture-reviewer',
    previous_status: 'pending', next_status: 'approved', note: 'Existing approval history', revision: 2, created_at: now - 1500,
  });
  insert(db, 'project_claims', {
    id: 'existing-claim', project_id: 'vamps', project_name: 'VAMPS', user_id: owner, account_email: 'fixture-owner@rmt.example',
    method: 'website', official_channel_url: 'https://vamps.wtf/', verification_code: 'fixture-curated-proof',
    proof_url: 'https://vamps.wtf/proof', note: 'Existing private claim', status: 'approved', review_note: 'Ownership checked.',
    revision: 3, expires_at: now + 86_400_000, created_at: now - 1600, updated_at: now - 1000,
  });
  insert(db, 'claim_review_events', {
    id: 'existing-claim-review', claim_id: 'existing-claim', reviewer_id: 'fixture-reviewer',
    previous_status: 'pending', next_status: 'approved', note: 'Existing proof checked.', revision: 3, created_at: now - 1000,
  });
  insert(db, 'project_owners', {
    project_id: 'vamps', user_id: owner, claim_id: 'existing-claim', status: 'active', revision: 1,
    created_at: now - 1000, updated_at: now - 1000,
  });
  insert(db, 'project_owners', {
    project_id: 'community-existing-community', user_id: owner, claim_id: null, status: 'active', revision: 1,
    created_at: now - 1500, updated_at: now - 1500,
  });
  insert(db, 'project_artwork', {
    id: 'existing-artwork', project_id: 'vamps', user_id: owner, ownership_revision: 1, kind: 'logo',
    object_key: 'fixture-private-artwork-key', mime: 'image/png', width: 128, height: 128, byte_size: 413,
    digest: 'fixture-artwork-digest', status: 'ready', created_at: now - 900,
  });
  const payload = JSON.stringify({
    projectId: 'vamps', baseRevision: 0, summary: 'The existing reviewed project description and official destinations.',
    category: 'Games', stage: 'building', website: 'https://vamps.wtf/', launchUrl: 'https://games.vamps.wtf/',
    xProfile: '', links: [], logoAssetId: 'existing-artwork', bannerAssetId: null,
  });
  insert(db, 'project_edits', {
    id: 'existing-edit', project_id: 'vamps', project_name: 'VAMPS', user_id: owner, ownership_revision: 1,
    base_revision: 0, payload_json: payload, status: 'approved', review_note: 'Existing public edit.',
    revision: 2, created_at: now - 800, updated_at: now - 600,
  });
  insert(db, 'edit_review_events', {
    id: 'existing-edit-review', edit_id: 'existing-edit', reviewer_id: 'fixture-reviewer', previous_status: 'pending',
    next_status: 'approved', note: 'Existing artwork reviewed.', revision: 2, created_at: now - 600,
  });
  insert(db, 'project_overrides', {
    project_id: 'vamps', payload_json: payload, revision: 1, edit_id: 'existing-edit', updated_at: now - 600,
  });
  insert(db, 'account_links', { firebase_uid: 'fixture-firebase-uid', legacy_user_id: owner, created_at: now - 500 });
  insert(db, 'saved_projects', { user_id: owner, project_id: 'vamps', created_at: now - 400 });
  insert(db, 'saved_projects', { user_id: owner, project_id: 'community-existing-community', created_at: now - 300 });

  const statuses = ['pending', 'sending', 'sent', 'failed', 'unconfigured', 'uncertain'];
  for (const [index, status] of statuses.entries()) {
    for (const channel of ['email', 'sms']) {
      const kind = ['submission', 'claim', 'edit'][index % 3];
      const id = `existing-${channel}-${status}`;
      const eventKey = `${kind}:existing-event-${index}:revision:${index + 1}:pending`;
      insert(db, 'notification_outbox', {
        id, event_key: eventKey, kind, entity_id: `existing-event-${index}`, project_name: `Existing project ${index}`,
        channel, status, attempt_count: index % 4, provider_id: status === 'sent' ? 'fixture-provider-message' : '',
        last_error: status === 'uncertain' ? 'outcome_unknown' : status === 'failed' ? 'provider_http_422' : '',
        payload_json: JSON.stringify({
          version: 1, channel: 'email', credentialFingerprint: 'fixture-credential-fingerprint', ambiguous: status === 'uncertain',
          body: { from: 'RMT <fixture-sender@rmt.example>', to: ['fixture-reviewer@rmt.example'], subject: `Frozen ${id}`, text: 'Exact historical payload\nKeep retry identity unchanged.' },
        }),
        first_attempt_at: status === 'pending' || status === 'unconfigured' ? null : now - 200,
        sent_at: status === 'sent' ? now - 100 : null, created_at: now - 250, updated_at: now - 100 + index,
      });
      if (channel === 'email') insert(db, 'review_alert_receipts', { reviewer_id: 'fixture-reviewer', event_key: eventKey, acknowledged_at: now - 50 + index });
    }
  }
}

test('updates migration preserves existing accounts, ownership, artwork, library and exact notification replay state', t => {
  assert.ok(updateMigrations.length, 'A forward migration is required for the updates feature.');
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(beforeSchema);
  seedExistingData(db);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
  const records = Object.fromEntries(tables.map(table => [table, snapshot(db, table)]));
  const oldOutboxColumns = db.prepare('PRAGMA table_info(notification_outbox)').all();

  // This starts with the deployed schema and real historical row shapes. A fresh
  // database-only test cannot catch a dropped column, lost row, or reset retry.
  db.exec(upgradeSchema);
  for (const table of tables) {
    const expected = table === 'project_claims' ? records[table].map(row => ({...row, proof_method:'manual'})) : table === 'submissions' ? records[table].map(row=>({...row,category_selection:'[]'})) : records[table];
    assert.deepEqual(snapshot(db, table), expected, `${table} historical data must survive the upgrade`);
  }
  assert.deepEqual(db.prepare('PRAGMA table_info(notification_outbox)').all(), oldOutboxColumns);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');

  const outbox = records.notification_outbox[0];
  assert.throws(() => insert(db, 'notification_outbox', {...outbox, id: 'duplicate-retry-key'}), /UNIQUE constraint failed/);
  assert.throws(() => insert(db, 'notification_outbox', {...outbox, id: 'invalid-kind', event_key: 'invalid-kind', kind: 'unknown'}), /CHECK constraint failed/);
  assert.throws(() => insert(db, 'notification_outbox', {...outbox, id: 'invalid-status', event_key: 'invalid-status', status: 'delivered'}), /CHECK constraint failed/);
  assert.throws(() => insert(db, 'notification_outbox', {...outbox, id: 'invalid-channel', event_key: 'invalid-channel', channel: 'push'}), /CHECK constraint failed/);
  insert(db, 'notification_outbox', {...outbox, id: 'new-update-intent', event_key: 'update:fixture-update:revision:2:pending', kind: 'update'});
  assert.equal(db.prepare("SELECT kind FROM notification_outbox WHERE id='new-update-intent'").get().kind, 'update');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('outbox_event_channel','outbox_status_created')").get().n, 2);
});
