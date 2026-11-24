import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiled = await build({stdin: {contents: `export * from './lib/client/project-updates';`, resolveDir: root, loader: 'ts'}, absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24'});
const {publicUpdatesPage} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const post = {id:'example-update', projectId:'example-project', projectName:'Example project', kind:'release', title:'A new release', body:'The first public version is now ready to explore.', linkLabel:'Explore the release', linkUrl:'https://example.org/release', publishedAt:1795543200000};

test('public update pages retain only public fields and represent both empty and paginated results', () => {
  assert.deepEqual(publicUpdatesPage({updates:[], nextCursor:null, hasMore:false}, 'example-project'), {updates:[],nextCursor:null,hasMore:false});
  const parsed=publicUpdatesPage({updates:[{...post,userId:'private-owner',reviewNote:'private-review'}],nextCursor:'YXQx',hasMore:true}, 'example-project');
  assert.deepEqual(parsed,{updates:[post],nextCursor:'YXQx',hasMore:true});
  assert.equal('userId' in parsed.updates[0],false);
});

test('wrong-project, unsafe-link and malformed responses cannot masquerade as a valid public feed', () => {
  const invalid=[null,{}, {updates:[],nextCursor:3}, {updates:[],nextCursor:null,hasMore:true},
    {updates:[{...post,projectId:'another-project'}],nextCursor:null},
    {updates:[{...post,linkUrl:'javascript:alert(1)'}],nextCursor:null},
    {updates:[{...post,linkUrl:'https://user:password@example.org/'}],nextCursor:null},
    {updates:[{...post,publishedAt:'yesterday'}],nextCursor:null},
    {updates:[{...post,publishedAt:8_640_000_000_000_001}],nextCursor:null},
    {updates:[{...post,kind:'unknown'}],nextCursor:null},
    {updates:[post,post],nextCursor:null}];
  for(const value of invalid) assert.throws(()=>publicUpdatesPage(value,'example-project'),/could not be loaded/);
});
