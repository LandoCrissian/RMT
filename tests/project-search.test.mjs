import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({
  stdin: { contents: `export * from './lib/project-search'; export {seedProjects} from './lib/catalog';`, resolveDir: root, loader: 'ts' },
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24',
});
const { searchProjects, projectMatchesSearch, seedProjects } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const suited = seedProjects.find(project => project.id === 'suited-apes');
assert.ok(suited, 'The regression uses the real Suited Apes Society listing.');

test('a partial project name works with uppercase and trailing mobile-keyboard whitespace', () => {
  for (const query of ['sui', 'SUI', ' SuI ', 'sui\u00a0', 'SUITED APES']) {
    assert.ok(searchProjects(seedProjects, { query }).some(project => project.id === suited.id), query);
  }
});

test('word order, repeated spaces, and punctuation do not hide a matching project', () => {
  for (const query of ['apes  suited', 'suited-ap', 'SOCIETY, SUI']) {
    assert.equal(projectMatchesSearch(suited, query), true, query);
  }
  assert.equal(projectMatchesSearch(suited, 'sui unrelatedword'), false, 'Every requested word must match.');
});

test('existing initials, name initials, destinations, and app names can find a project', () => {
  for (const query of ['SA', 'SAS', 'suitedapes.com', 'JungleTree', 'ape fight club']) {
    assert.equal(projectMatchesSearch(suited, query), true, query);
  }
});

test('category filters remain in effect even when a name matches elsewhere', () => {
  assert.deepEqual(searchProjects(seedProjects, { query: 'sui', category: 'Music' }), []);
  assert.deepEqual(searchProjects(seedProjects, { query: 'sui', category: 'Community' }), []);
  for (const category of ['All projects', 'Games', 'Tools']) {
    assert.ok(searchProjects(seedProjects, { query: 'sui', category }).some(project => project.id === suited.id), category);
  }
});

test('library search stays within saved IDs while an all-project search can reveal other matches', () => {
  assert.deepEqual(searchProjects(seedProjects, { query: 'sui', savedIds: [] }), []);
  assert.deepEqual(searchProjects(seedProjects, { query: 'sui', savedIds: ['lammbs'] }), []);
  assert.deepEqual(searchProjects(seedProjects, { query: 'sui', savedIds: [suited.id] }).map(project => project.id), [suited.id]);
  assert.ok(searchProjects(seedProjects, { query: 'sui' }).some(project => project.id === suited.id));
});

test('empty searches retain the scope and collection names are searchable', () => {
  assert.deepEqual(searchProjects(seedProjects, { query: ' \t\n ' }), seedProjects);
  assert.deepEqual(searchProjects(seedProjects, { query: ' ', savedIds: [suited.id] }).map(project => project.id), [suited.id]);
  const collectionProject = seedProjects.find(project => project.collections?.length);
  assert.ok(collectionProject, 'A real collection listing is present.');
  assert.equal(projectMatchesSearch(collectionProject, collectionProject.collections[0].name), true);
});

test('taxonomy filters combine primary and secondary assignments without duplicating listings', () => {
  const labels = {gaming:'Gaming', apps:'Apps & Utilities', art:'Art & Entertainment'};
  const first = {...suited, classification:{primary:'gaming',secondary:['apps'],labels}};
  const second = {...suited, id:'second',classification:{primary:'art',secondary:[],labels}};
  const projects = [first,second];
  assert.deepEqual(searchProjects(projects,{categories:['gaming','apps']}),[first]);
  assert.deepEqual(searchProjects(projects,{categories:['apps','art']}),projects);
  assert.deepEqual(searchProjects(projects,{categories:['apps','art'],savedIds:['second']}),[second]);
  assert.deepEqual(searchProjects(projects,{categories:['art'],query:'apps utilities'}),[]);
  assert.deepEqual(searchProjects(projects,{query:'utilities'}),[first]);
  assert.deepEqual(searchProjects(projects,{query:'entertainment'}),[second]);
  assert.deepEqual(searchProjects(projects,{categories:['unused-category']}),[]);
  assert.deepEqual(searchProjects([suited],{categories:['gaming']}),[suited]);
});
