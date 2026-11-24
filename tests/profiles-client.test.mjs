import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/client/profiles';`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const {publicProfileResponse, privateProfileResponse, profileArtworkList, uploadedProfileArtwork, profileResponseData, profileForm, ProfileRequestError} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const now = 1795543200000;
const avatarId = '51111111-1111-4111-8111-111111111111';
const image = {id: avatarId, kind: 'avatar', url: '/api/profile-artwork/' + avatarId, width: 256, height: 256, mime: 'image/png'};
const project = {id: 'workshop', slug: 'workshop', name: 'Workshop', tagline: 'A sample creative studio.', category: 'Tools', cover: '/projects/workshop.webp', initials: 'W', accent: '#ccff00'};
const privateProfile = {handle: 'workshop-builder', displayName: 'Workshop Builder', bio: 'Making things for the community.', visibility: 'private', showManagedProjects: false,
  avatarAssetId: avatarId, bannerAssetId: null, links: [{label: 'My website', url: 'https://example.org/'}], revision: 2, handleLocked: false, firstPublishedAt: null,
  createdAt: now, updatedAt: now, avatar: image, banner: null, managedProjects: [project], isBuilder: true};
const publicProfile = {handle: privateProfile.handle, displayName: privateProfile.displayName, bio: privateProfile.bio, links: privateProfile.links,
  avatar: {...image, url: '/media/profile-artwork/' + avatarId}, banner: null, managedProjects: [project], isBuilder: true};
const response = (value, status = 200) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json'}});

test('a new profile is explicitly private and has no imported sign-in identity or project sharing', () => {
  assert.equal(privateProfileResponse({profile: null}), null);
  assert.deepEqual(profileForm(null), {expectedRevision: 0, handle: '', displayName: '', bio: '', visibility: 'private', showManagedProjects: false, avatarAssetId: null, bannerAssetId: null, links: []});
  assert.throws(() => privateProfileResponse({}), ProfileRequestError);
  const form = profileForm(privateProfile);
  form.links[0].label = 'Edited locally';
  assert.equal(privateProfile.links[0].label, 'My website', 'editing must not mutate the last confirmed saved version');
});

test('public profiles retain only selected public fields, including nested project records', () => {
  const parsed = publicProfileResponse({profile: {...publicProfile, email: 'private@example.org', userId: 'owner', provider: 'google', library: ['private-favorite'], revision: 8,
    managedProjects: [{...project, contactEmail: 'secret@example.org', ownershipEvidence: 'private', ownerId: 'owner'}]}}, publicProfile.handle);
  assert.deepEqual(parsed, publicProfile);
  assert.equal('email' in parsed, false);
  assert.equal('ownerId' in parsed.managedProjects[0], false);
});

test('hidden profiles may clear their display name while retaining a permanent reserved handle', () => {
  const hidden = {...privateProfile, displayName: '', bio: '', handleLocked: true, firstPublishedAt: now};
  assert.equal(privateProfileResponse({profile: hidden}).displayName, '');
  assert.equal(privateProfileResponse({profile: hidden}).handleLocked, true);
  assert.throws(() => privateProfileResponse({profile: {...hidden, handle: ''}}), ProfileRequestError);
  assert.throws(() => privateProfileResponse({profile: {...hidden, visibility: 'public'}}), ProfileRequestError);
});

test('private/public image endpoints cannot be interchanged or point to a different asset', () => {
  assert.deepEqual(privateProfileResponse({profile: privateProfile}).avatar, image);
  assert.deepEqual(publicProfileResponse({profile: publicProfile}).avatar, publicProfile.avatar);
  for (const avatar of [image, {...publicProfile.avatar, url: 'https://tracker.example.org/image.png'}, {...publicProfile.avatar, url: '/media/profile-artwork/other'}, {...publicProfile.avatar, id: 'not-a-uuid'}]) {
    assert.throws(() => publicProfileResponse({profile: {...publicProfile, avatar}}), ProfileRequestError);
  }
  assert.throws(() => privateProfileResponse({profile: {...privateProfile, avatar: publicProfile.avatar}}), ProfileRequestError);
  assert.throws(() => privateProfileResponse({profile: {...privateProfile, avatarAssetId: null}}), ProfileRequestError);
});

test('malformed, wrong-handle and false builder responses never become successful public profiles', () => {
  const invalid = [null, {}, {profile: null}, {profile: {...publicProfile, handle: 'x'}}, {profile: {...publicProfile, managedProjects: null}},
    {profile: {...publicProfile, managedProjects: [project, project]}}, {profile: {...publicProfile, isBuilder: true, managedProjects: []}},
    {profile: {...publicProfile, links: [{label: 'Unsafe', url: 'javascript:alert(1)'}]}}, {profile: {...publicProfile, links: [{label: 'Unsafe', url: 'https://user:password@example.org/'}]}}];
  for (const value of invalid) assert.throws(() => publicProfileResponse(value), ProfileRequestError);
  assert.throws(() => publicProfileResponse({profile: publicProfile}, 'another-member'), ProfileRequestError);
});

test('managed project images accept only local catalog artwork and public project assets', () => {
  for (const cover of ['https://tracker.example.org/view.png', '/api/project-artwork/private', '/api/profile-artwork/' + avatarId, '//tracker.example.org/view.png']) {
    assert.throws(() => publicProfileResponse({profile: {...publicProfile, managedProjects: [{...project, cover}]}}), ProfileRequestError);
  }
  for (const cover of ['community', '/projects/workshop.webp', '/media/project-artwork/' + avatarId]) {
    assert.equal(publicProfileResponse({profile: {...publicProfile, managedProjects: [{...project, cover}]}}).managedProjects[0].cover, cover);
  }
  assert.throws(() => publicProfileResponse({profile: {...publicProfile, managedProjects: [{...project, logo: 'https://tracker.example.org/logo.png'}]}}), ProfileRequestError);
});

test('private parsing rejects missing fields and drops accidental provider metadata', () => {
  const parsed = privateProfileResponse({profile: {...privateProfile, userId: 'owner', email: 'private@example.org'}});
  assert.deepEqual(parsed, privateProfile);
  assert.throws(() => privateProfileResponse({profile: {...privateProfile, revision: 0}}), ProfileRequestError);
  assert.throws(() => privateProfileResponse({profile: {...privateProfile, firstPublishedAt: now, handleLocked: false}}), ProfileRequestError);
  assert.throws(() => privateProfileResponse({profile: {...privateProfile, managedProjects: undefined}}), ProfileRequestError);
});

test('401, 403 and account-mismatch responses invalidate private data even without JSON', async () => {
  for (const result of [response({error: 'Sign in required'}, 401), response({error: 'Access removed'}, 403), response({error: 'Account changed', code: 'account_changed'}, 409),
    new Response('<html>Sign in</html>', {status: 401}), new Response('', {status: 403}), response(null, 403)]) {
    await assert.rejects(profileResponseData(result, true), error => error instanceof ProfileRequestError && error.accountChanged && !error.needsRefresh);
  }
});

test('revision conflicts require a reload while an unavailable handle remains editable', async () => {
  await assert.rejects(profileResponseData(response({error: 'Your profile changed.', code: 'revision_conflict'}, 409), true), error => error.needsRefresh && !error.accountChanged);
  await assert.rejects(profileResponseData(response({error: 'That handle is already in use. Choose another.', code: 'handle_taken'}, 409), true), error => !error.needsRefresh && !error.accountChanged);
  await assert.rejects(profileResponseData(response({error: 'Add a valid link.'}, 400), true), error => !error.needsRefresh && !error.accountChanged);
});

test('unknown save outcomes require reconciliation before another mutation', async () => {
  for (const result of [new Response('bad gateway', {status: 502}), response({error: 'Storage unavailable'}, 500), response(null), new Response('not JSON')]) {
    await assert.rejects(profileResponseData(result, true), error => error instanceof ProfileRequestError && error.needsRefresh && !error.accountChanged);
  }
});

test('uploaded artwork lists fail visibly on invalid IDs, duplicates or wrong image kind', () => {
  const upload = {...image, previewUrl: image.url, byteSize: 2048, createdAt: now};
  assert.deepEqual(profileArtworkList({artwork: [upload]}), [upload]);
  assert.deepEqual(profileArtworkList({artwork: []}), []);
  assert.throws(() => profileArtworkList({}), ProfileRequestError);
  assert.throws(() => profileArtworkList({artwork: [upload, upload]}), ProfileRequestError);
  assert.throws(() => uploadedProfileArtwork(upload, 'banner'), ProfileRequestError);
  assert.throws(() => uploadedProfileArtwork({...upload, previewUrl: '/media/profile-artwork/' + avatarId}), ProfileRequestError);
  assert.throws(() => uploadedProfileArtwork({...upload, byteSize: 3 * 1024 * 1024}), ProfileRequestError);
});
