import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const target='https://rmt-hub.wise-elf-8473.chatgpt.site';

test('Netlify preview permits precisely the reviewed public Firebase client identifier',async()=>{
  const config=await readFile(new URL('netlify.toml',root),'utf8');
  const [base,preview]=config.split('[context.deploy-preview.environment]');
  assert.ok(preview);assert.doesNotMatch(base,/^\s*SECRETS_SCAN_/m);
  const entries=preview.split('\n').map(line=>line.trim()).filter(line=>line && !line.startsWith('#'));
  assert.equal(entries.length,1);
  const allowed=entries[0].match(/^SECRETS_SCAN_SMART_DETECTION_OMIT_VALUES\s*=\s*"([^",]+)"$/)?.[1];
  assert.ok(allowed);
  const digest=value=>createHash('sha256').update(value).digest('hex');
  const expected='853243614e427ed2d7ed1ced82779163c02c83cbd9954503a4bb31037dbc493c';
  assert.equal(digest(allowed),expected);
  const source=await readFile(new URL('lib/firebase-config.ts',root),'utf8');
  assert.equal(digest(source.match(/apiKey:\s*'([^']+)'/)[1]),expected);
});

test('the redirect builds without application dependencies and preserves the deep link on a fixed origin',async t=>{
  const tmp=await mkdtemp(path.join(os.tmpdir(),'rmt-redirect-'));
  t.after(()=>rm(tmp,{recursive:true,force:true}));
  await mkdir(path.join(tmp,'scripts'));
  const file=path.join(tmp,'scripts/build-netlify-entry.mjs');
  await copyFile(new URL('scripts/build-netlify-entry.mjs',root),file);
  execFileSync(process.execPath,[file],{cwd:tmp,stdio:'pipe'});
  const out=path.join(tmp,'dist/netlify-entry');
  assert.deepEqual((await readdir(out)).sort(),['_redirects','index.html']);
  assert.equal((await readFile(path.join(out,'_redirects'),'utf8')).trim(),'/* '+target+'/:splat 302!');
  const html=await readFile(path.join(out,'index.html'),'utf8');
  assert.ok(html.includes('href="'+target+'/"'));
  assert.doesNotMatch(html,/firebase|apiKey|<iframe|<form/i);
  const script=html.match(/<script>([\s\S]+?)<\/script>/)[1];
  for(const pathname of ['/projects/apex-rising','//another.example/deep']){
    const link={},address={};
    runInNewContext(script,{URL,location:{protocol:'https:',pathname,search:'?from=release30',hash:'#review'},document:{getElementById:id=>id==='open-rmt'?link:address}});
    const dest=new URL(link.href);assert.equal(dest.origin,target);assert.equal(dest.pathname,pathname);
    assert.equal(dest.search,'?from=release30');assert.equal(dest.hash,'#review');assert.equal(address.textContent,link.href);
  }
});

