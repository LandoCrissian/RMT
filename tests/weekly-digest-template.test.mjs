import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const root=fileURLToPath(new URL('../',import.meta.url));
const {outputFiles}=await build({
  entryPoints:['components/WeeklyDigestTemplate.tsx'],
  absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'esm',define:{'process.env.NODE_ENV':'"production"'},
});
const {default:Template}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const render=digest=>renderToStaticMarkup(createElement(Template,{digest}));
const empty={from:Date.UTC(2026,0,1),through:Date.UTC(2026,0,8),updates:[],events:[],additions:[]};
test('branded weekly template escapes reviewed copy and only links to canonical member-facing pages',()=>{
  const content=render({...empty,updates:[{id:'update-1',title:'<script>Example</script>',project:'A & B',path:'/projects/example#updates',at:empty.from}]});
  assert.match(content,/RMT Weekly/);
  assert.match(content,/&lt;script&gt;Example&lt;\/script&gt;/);
  assert.match(content,/A &amp; B/);
  assert.match(content,/href="https:\/\/rmtlaunch\.fun\/projects\/example#updates"/);
  assert.doesNotMatch(content,/<script|<img|<iframe|mailto:|[?&]utm_/);
  assert.match(render(empty),/There are no updates/);
});
