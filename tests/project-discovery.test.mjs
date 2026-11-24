import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: { contents: `export * from './lib/project-discovery'; export {seedProjects} from './lib/catalog';`, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const { discoverProjects, recentProjects, DIRECTORY_PAGE_SIZE, seedProjects } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const makeProject = (id, overrides = {}) => ({
  id, slug: id, name: id, tagline: '', description: '', category: 'Community',
  website: '', launchUrl: 'https://example.com/' + id, launchLabel: 'Visit',
  links: [], initials: id.slice(0, 2), accent: '#ccff00', cover: '',
  claimed: false, source: 'curated', ...overrides,
});
const ids = projects => projects.map(project => project.id);

test('every real catalog entry is reachable exactly once across bounded pages', () => {
  const first = discoverProjects(seedProjects, { pageSize: 3 });
  const reached = [];
  for (let page = 1; page <= first.pageCount; page += 1) {
    const result = discoverProjects(seedProjects, { page, pageSize: 3 });
    assert.ok(result.items.length > 0 && result.items.length <= 3);
    assert.equal(result.start, reached.length + 1);
    reached.push(...ids(result.items));
    assert.equal(result.end, reached.length);
  }
  assert.equal(reached.length, seedProjects.length);
  assert.equal(new Set(reached).size, seedProjects.length);
  assert.deepEqual([...reached].sort(), ids(seedProjects).sort());
});

test('search, category, and saved-library scopes are applied before pagination', () => {
  const projects = [
    makeProject('z-game', { name: 'Orbit Z', category: 'Games' }),
    makeProject('a-community', { name: 'Orbit A' }),
    makeProject('b-game', { name: 'Orbit B', category: 'Games' }),
    makeProject('c-game', { name: 'Orbit C', category: 'Games' }),
    makeProject('other-game', { name: 'Different', category: 'Games' }),
  ];
  const result = discoverProjects(projects, { query: ' ORBit ', category: 'Games', savedIds: ['z-game', 'b-game', 'a-community', 'other-game'], pageSize: 1, page: 2 });
  assert.deepEqual(ids(result.items), ['z-game']);
  assert.equal(result.total, 2);
  assert.equal(result.pageCount, 2);
  assert.equal(result.start, 2);
  assert.equal(result.end, 2);
  assert.deepEqual(discoverProjects(projects, { savedIds: [] }).items, []);
});

test('partial mobile searches still find Suited Apes after a stale later-page request', () => {
  for (const query of ['sui', ' SUI ', 'sui\u00a0', 'Suited-ap']) {
    const result = discoverProjects(seedProjects, { query, page: 999, pageSize: 2 });
    assert.ok(result.items.some(project => project.id === 'suited-apes'), query);
    assert.equal(result.page, 1);
  }
  assert.equal(discoverProjects(seedProjects, { query: 'sui', category: 'Music' }).total, 0);
});

test('page changes stay in range and invalid sizes cannot create an unbounded page', () => {
  const projects = Array.from({ length: 60 }, (_, index) => makeProject(`Project ${index + 1}`));
  for (const page of [-20, 0, NaN, Infinity, -Infinity]) {
    const result = discoverProjects(projects, { page });
    assert.equal(result.page, 1);
    assert.equal(result.items.length, DIRECTORY_PAGE_SIZE);
  }
  const last = discoverProjects(projects, { page: 999, pageSize: 8 });
  assert.equal(last.page, 8);
  assert.equal(last.start, 57);
  assert.equal(last.end, 60);
  assert.equal(last.items.length, 4);
  assert.equal(discoverProjects(projects, { page: 2.9 }).page, 2);
  for (const pageSize of [0, -2, NaN, Infinity]) assert.equal(discoverProjects(projects, { pageSize }).items.length, DIRECTORY_PAGE_SIZE);
  assert.equal(discoverProjects(projects, { pageSize: 0.5 }).items.length, 1);
  assert.equal(discoverProjects(projects, { pageSize: 1_000_000 }).items.length, 48);
});

test('empty results expose a stable zero range without an impossible current page', () => {
  const result = discoverProjects(seedProjects, { query: 'absolutely-no-matching-project-937515', page: 12 });
  assert.deepEqual(result, { items: [], total: 0, page: 1, pageCount: 1, start: 0, end: 0 });
  assert.deepEqual(discoverProjects([]), result);
});

test('newest means explicit RMT listing dates, with name ties and undated entries last', () => {
  const projects = [
    makeProject('unknown', { name: 'A Unknown' }),
    makeProject('old', { name: 'Z Old', listedAt: '2026-11-23' }),
    makeProject('new-z', { name: 'Z New', listedAt: '2026-11-24T12:00:00.000Z' }),
    makeProject('bad', { name: 'B Invalid', listedAt: '2026-02-31' }),
    makeProject('new-a', { name: 'A New', listedAt: '2026-11-24T05:00:00-07:00' }),
    makeProject('epoch', { name: 'Epoch', listedAt: '1970-01-01' }),
    makeProject('ambiguous', { name: 'C Ambiguous', listedAt: '11/24/2026' }),
  ];
  assert.deepEqual(ids(discoverProjects(projects, { sort: 'recent' }).items), ['new-a', 'new-z', 'old', 'epoch', 'unknown', 'bad', 'ambiguous']);
  assert.deepEqual(ids(recentProjects(projects)), ['new-a', 'new-z', 'old']);
  assert.deepEqual(ids(recentProjects(projects, 20)), ['new-a', 'new-z', 'old', 'epoch']);
  assert.deepEqual(recentProjects(projects, 0), []);
  assert.deepEqual(recentProjects(projects, -2), []);
  assert.deepEqual(recentProjects([makeProject('undated')]), []);
});

test('name ordering is deterministic and numeric names keep their natural order', () => {
  const projects = [makeProject('p10', { name: 'Project 10' }), makeProject('z', { name: 'Project 2' }), makeProject('a', { name: 'project 2' }), makeProject('p1', { name: 'Project 1' })];
  assert.deepEqual(ids(discoverProjects(projects).items), ['p1', 'a', 'z', 'p10']);
});

test('sorting and pagination never mutate the input catalog or its listing dates', () => {
  const projects = Object.freeze([
    Object.freeze(makeProject('z', { listedAt: '2026-11-24' })),
    Object.freeze(makeProject('a', { listedAt: '2026-11-23' })),
    Object.freeze(makeProject('b')),
  ]);
  const original = JSON.stringify(projects);
  discoverProjects(projects, { sort: 'name', pageSize: 1, page: 2 });
  discoverProjects(projects, { sort: 'recent', query: 'z' });
  recentProjects(projects);
  assert.equal(JSON.stringify(projects), original);
});
