import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({stdin: {contents: `export * from './lib/client/activity';`, resolveDir: root, loader: 'ts'},
  absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const {publicActivityPage} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const project = {id: 'vamps', slug: 'vamps', name: 'VAMPS', category: 'Games', initials: 'V', accent: '#c69cff', cover: '/projects/vamps-scene.webp', coverAspectRatio: 1.777778};
const item = {id: 'update-example', kind: 'release', publishedAt: 1795543200000, project,
  title: 'A new release', body: 'The first public version is ready for people to explore.', linkLabel: 'Explore the release', linkUrl: 'https://vamps.wtf/release', updateId: 'example'};
const page = items => ({items, nextCursor: null, hasMore: false});

test('activity parser retains explicit public fields, including local artwork, and keeps empty pages honest', () => {
  assert.deepEqual(publicActivityPage(page([])), page([]));
  const unsafe = {...item, userId: 'private-owner', reviewNote: 'private-note', project: {...project, accountEmail: 'private@rmt.dev'}};
  assert.deepEqual(publicActivityPage(page([unsafe])), page([item]));
  const artwork = {id: 'test-artwork', url: '/media/project-artwork/test-artwork', width: 100, height: 100, mime: 'image/png'};
  const artItem = {...item, project: {...project, artwork: {logo: {...artwork, objectKey: 'private-r2-object'}}}};
  const parsed = publicActivityPage(page([artItem]));
  assert.deepEqual(parsed.items[0].project.artwork.logo, artwork);
  assert.equal(JSON.stringify(parsed).includes('private-r2-object'), false);
  const listing = {...item, id: 'listing-vamps', kind: 'listing', title: 'Joined RMT', updateId: null, linkLabel: '', linkUrl: ''};
  assert.deepEqual(publicActivityPage(page([listing])), page([listing]));
});

test('unsafe destinations, images and malformed identities cannot enter the public activity view model', () => {
  const variants = [
    {linkUrl: 'javascript:alert(1)'}, {linkUrl: 'https://user:password@vamps.wtf/'}, {linkUrl: 'https://127.0.0.1/'},
    {linkUrl: 'https://private.local/'}, {linkLabel: ''}, {kind: 'private'}, {publishedAt: 'today'}, {publishedAt: 9e15},
    {updateId: 'other-update'}, {id: 'listing-vamps'}, {project: {...project, slug: '../account'}},
    {project: {...project, cover: '//malicious.dev/image.png'}}, {project: {...project, cover: '/api/profile-artwork/private'}},
    {project: {...project, logo: 'https://tracker.dev/image.png'}}, {project: {...project, coverBackground: 'url(https://tracker.dev/image)'}},
    {project: {...project, artwork: {logo: {id: 'wrong', url: '/media/project-artwork/other', width: 100, height: 100, mime: 'image/png'}}}},
  ];
  for (const variant of variants) assert.throws(() => publicActivityPage(page([{...item, ...variant}])), /could not be loaded/);
  for (const value of [null, {}, {items: [], nextCursor: 'YWJj', hasMore: true}, {...page([]), hasMore: true},
    page([item, item]), page([{...item, publishedAt: item.publishedAt - 1}, {...item, id: 'update-next', updateId: 'next'}]),
    {...page([item]), nextCursor: '/unsafe/cursor', hasMore: true}]) {
    assert.throws(() => publicActivityPage(value), /could not be loaded/);
  }
});
