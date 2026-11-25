import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['lib/client/calendar-suggestions.ts'],platform:'browser',format:'esm',write:false,bundle:true});
const {reviewSuggestions}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const row={projectId:'vamps',sourceKey:'a'.repeat(64),title:'Fixture release',description:'A public official event.',startsAt:1800000000000,endsAt:null,destination:'https://project.example/events/launch',sourceUrl:'https://project.example/events',typeId:'community',access:'Free entry'};
const parse=suggestions=>reviewSuggestions({version:1,suggestions},new Set(['vamps']));
test('review file imports project-specific event content while removing unrecognized fields',()=>{
  assert.deepEqual(parse([{...row,status:'published',actor:'forged',featured:true}]),[row]);
  assert.deepEqual(parse([]),[]);
});
test('review file rejects unknown projects, unsafe links and invalid or unbounded content',()=>{
  for(const change of [{projectId:'unknown'},{sourceKey:''},{sourceUrl:'javascript:alert(1)'},{destination:'https://person:private@project.example/event'},
    {startsAt:1e20},{endsAt:row.startsAt},{description:'a'.repeat(2001)},{title:''},{access:'x'.repeat(301)}])
    assert.throws(()=>parse([{...row,...change}]),/unknown project/);
  assert.throws(()=>parse(Array(501).fill(row)),/500/);
  assert.throws(()=>reviewSuggestions({version:2,suggestions:[row]},new Set(['vamps'])),/version/);
});

