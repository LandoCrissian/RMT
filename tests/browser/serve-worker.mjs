import {readFile,readdir} from 'node:fs/promises';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {Miniflare}=require('miniflare');
const {unstable_getMiniflareWorkerOptions}=require('wrangler');
const root=resolve('dist/server');
const {workerOptions}=unstable_getMiniflareWorkerOptions(join(root,'wrangler.json'));
const state=process.argv[2]||mkdtempSync(join(tmpdir(),'rmt-guide-'));
const files=(await readdir(root,{recursive:true})).filter(name=>name!=='index.js'&&/\.(?:js|mjs)$/.test(name));
const modules=await Promise.all(['index.js',...files].map(async name=>{
  const path=join(root,name);
  return {type:'ESModule',path,contents:await readFile(path,'utf8')};
}));
const worker=new Miniflare({...workerOptions,host:'127.0.0.1',port:5178,modulesRoot:root,modules,
  d1Persist:join(state,'v3','d1'),r2Persist:join(state,'v3','r2'),cachePersist:join(state,'v3','cache')});
console.log('Isolated release Worker ready',String(await worker.ready));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await worker.dispose();process.exit(0);});
