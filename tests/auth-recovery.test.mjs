import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
const result = await build({stdin:{contents:"export * from './lib/auth-attempt'; export * from './lib/submission-draft';",resolveDir:root},bundle:true,write:false,platform:'node',format:'esm'});
const url = 'data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64');
let n=0;
async function setup(t) {
  const records=new Map(),cookies=new Map();
  globalThis.window={location:new URL('https://www.rmtlaunch.fun/?continue=%2F%23studio#account'),sessionStorage:{getItem:k=>records.get(k)??null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k)}};
  globalThis.document={get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},set cookie(header){const [pair]=header.split(';');const [k,v]=pair.split('=');if(header.includes('Max-Age=0')) cookies.delete(k);else cookies.set(k,v);}};
  t.after(()=>{delete globalThis.window; delete globalThis.document;});
  return {api:await import(url+'#'+(++n)),records,cookies};
}
test('bare callback can recover a validated public route across tabs without copying callback secrets',async t=>{
  const {api,records,cookies}=await setup(t);
  api.writeAttempt('redirect');records.clear();
  window.location=new URL('https://www.rmtlaunch.fun/?authRecovery=handler&state=secret&code=secret#account');
  assert.equal(api.externalAuthLink(),'https://www.rmtlaunch.fun/?continue=%2F%23studio#account');
  assert.doesNotMatch(JSON.stringify([...cookies]),/secret/);
  window.location=new URL('https://www.rmtlaunch.fun/?continue=%2F%23library#account');
  api.writeAttempt('popup');records.clear();
  window.location.search='?authRecovery=handler';
  assert.equal(api.externalAuthLink(),'https://www.rmtlaunch.fun/#account');
  cookies.set('__Host-rmt-auth-route',encodeURIComponent('//outside.invalid'));
  assert.equal(api.externalAuthLink(),'https://www.rmtlaunch.fun/#account');
});
test('private submission recovery is same-user, tab-local, expiring and explicitly cleared',async t=>{
  const {api,records}=await setup(t);
  const form={name:'Draft',summary:'text',category:'Games',stage:'beta',website:'',launchUrl:'',xProfile:'x.com/example',contactEmail:'private@example.test',ownershipEvidence:'private',companyFax:''};
  const edit={id:'application', revision:3};
  api.saveSubmissionDraft('user-1',form,edit);
  const reload=await import(url+'#'+(++n));
  assert.deepEqual(reload.restoreSubmissionDraft('user-1').form,form);
  assert.deepEqual(reload.restoreSubmissionDraft('user-1').edit,edit);
  assert.equal(reload.restoreSubmissionDraft('user-2'),null);
  assert.equal(records.size,0);
  api.saveSubmissionDraft('user-1',form,null);
  const [key,value]=[...records][0];
  records.set(key,JSON.stringify({...JSON.parse(value),expires:Date.now()-1}));
  assert.equal(reload.restoreSubmissionDraft('user-1'),null);
  api.forgetSubmissionDraft();
  assert.equal(api.restoreSubmissionDraft('user-1'),null);
  window.sessionStorage.setItem=()=>{throw Error('blocked');};
  api.saveSubmissionDraft('user-1',form,null);
  assert.deepEqual(api.restoreSubmissionDraft('user-1').form,form);
});
