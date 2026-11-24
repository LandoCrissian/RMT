import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: { contents: `export * from './lib/server/repository'; export * from './lib/server/project-edits'; export * from './lib/submission-validation'; export * from './lib/project-discovery';`, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const migrations = (await readdir(new URL('../drizzle/', import.meta.url))).filter(file => /^\d.*\.sql$/.test(file)).sort();
const schema = (await Promise.all(migrations.map(file => readFile(new URL('../drizzle/' + file, import.meta.url), 'utf8')))).join('\n');

function database(t) {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys=ON'); raw.exec(schema); t.after(() => raw.close());
  function prepare(sql, values = []) {
    return {
      bind(...parameters) { return prepare(sql, parameters); },
      async first() { return raw.prepare(sql).get(...values) ?? null; },
      async all() { return { success: true, results: raw.prepare(sql).all(...values), meta: { changes: 0 } }; },
      async run() { return { success: true, results: [], meta: { changes: Number(raw.prepare(sql).run(...values).changes) } }; },
    };
  }
  return { raw, prepare, async batch(statements) {
    raw.exec('BEGIN');
    try { const result = []; for (const statement of statements) result.push(await statement.run()); raw.exec('COMMIT'); return result; }
    catch (error) { raw.exec('ROLLBACK'); throw error; }
  } };
}

const owner = { userId: 'private-listing-builder', email: 'private-builder@example.dev', displayName: 'Builder', emailVerified: true };
const firstPublished = Date.parse('2026-11-24T09:30:00.000Z');
function input(suffix) {
  return api.validateSubmission({ name: `Listing date ${suffix}`, summary: 'An independent browser game with a working public launch page.', category: 'Games', stage: 'building',
    website: `https://${suffix}.example.dev/`, launchUrl: `https://${suffix}.example.dev/play`, xProfile: '', contactEmail: 'private-contact@example.dev',
    ownershipEvidence: 'Private evidence to prove ownership of this project website.', companyFax: '' });
}
function decision(action, expectedRevision) {
  return api.validateDecision({ action, expectedRevision, note: 'Reviewed the official project ownership and destination.',
    ...(action === 'approve' ? { confirmedOwnership: true, checkedLinks: true } : {}) });
}
async function createApproved(db, suffix = 'date') {
  const submission = await api.createSubmission(db, owner, input(suffix));
  await api.reviewSubmission(db, 'private-reviewer', submission.id, decision('approve', 1));
  db.raw.prepare("UPDATE review_events SET created_at=? WHERE submission_id=? AND next_status='approved'").run(firstPublished, submission.id);
  return submission;
}

test('community listings expose first approval as ISO date, independent of application and update dates', async t => {
  const db = database(t);
  const submission = await createApproved(db);
  db.raw.prepare('UPDATE submissions SET created_at=?,updated_at=? WHERE id=?').run(Date.parse('2020-01-01'), Date.parse('2030-01-01'), submission.id);
  const catalog = await api.catalog(db);
  const project = catalog.projects.find(project => project.id === `community-${submission.id}`);
  assert.equal(project.listedAt, '2026-11-24T09:30:00.000Z');
  assert.ok(api.recentProjects([project]).some(item => item.id === project.id));
  const serialized = JSON.stringify(project);
  for (const privateValue of [owner.userId, owner.email, 'private-reviewer', 'private-contact@example.dev', input('date').ownershipEvidence, submission.verificationCode]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  for (const field of ['first_approved_at', 'created_at', 'updated_at', 'createdAt', 'updatedAt', 'reviewer_id']) assert.equal(Object.hasOwn(project, field), false, field);
});

test('approved owner edits and suspension followed by reapproval retain the original listing date', async t => {
  const db = database(t);
  const submission = await createApproved(db);
  const id = `community-${submission.id}`;
  const change = await api.createProjectEdit(db, owner, api.validateProjectEdit({
    projectId: id, baseRevision: 0, summary: 'A newly improved destination with browser games and community tools.', category: 'Games', stage: 'live',
    website: 'https://date.example.dev/', launchUrl: 'https://date.example.dev/play', xProfile: '', links: [],
  }));
  await api.reviewProjectEdit(db, 'private-reviewer', change.id, { action: 'approve', expectedRevision: 1, note: 'Checked the improved destination.' });
  let project = (await api.catalog(db)).projects.find(project => project.id === id);
  assert.equal(project.description, 'A newly improved destination with browser games and community tools.');
  assert.equal(project.listedAt, new Date(firstPublished).toISOString());
  await api.reviewSubmission(db, 'private-reviewer', submission.id, decision('suspend', 2));
  assert.equal((await api.catalog(db)).projects.some(project => project.id === id), false);
  await api.reviewSubmission(db, 'private-reviewer', submission.id, decision('approve', 3));
  project = (await api.catalog(db)).projects.find(project => project.id === id);
  assert.equal(project.listedAt, new Date(firstPublished).toISOString());
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM review_events WHERE submission_id=? AND next_status='approved'").get(submission.id).n, 2);
});

test('pending projects stay private and missing approval history does not invent recency', async t => {
  const db = database(t);
  const pending = await api.createSubmission(db, owner, input('pending'));
  assert.equal((await api.catalog(db)).projects.some(project => project.id === `community-${pending.id}`), false);
  const legacy = await createApproved(db, 'legacy');
  db.raw.prepare('DELETE FROM review_events WHERE submission_id=?').run(legacy.id);
  const project = (await api.catalog(db)).projects.find(project => project.id === `community-${legacy.id}`);
  assert.ok(project);
  assert.equal(Object.hasOwn(project, 'listedAt'), false);
  assert.deepEqual(api.recentProjects([project]), []);
});

test('invalid approval timestamps are omitted safely without breaking the public catalog projection', async t => {
  const db = database(t);
  const submission = await createApproved(db);
  const row = db.raw.prepare('SELECT * FROM submissions WHERE id=?').get(submission.id);
  for (const first_approved_at of [undefined, null, NaN, Infinity, -Infinity, 9e15, 'not-a-date', '2026-11-24']) {
    const project = api.publicProject({ ...row, first_approved_at });
    assert.equal(Object.hasOwn(project, 'listedAt'), false, String(first_approved_at));
  }
  assert.equal(api.publicProject({ ...row, first_approved_at: 0 }).listedAt, '1970-01-01T00:00:00.000Z');
});
