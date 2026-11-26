import assert from 'node:assert/strict';
import test from 'node:test';
import {buildSync} from 'esbuild';

const {outputFiles:[{text}]}=buildSync({
  stdin:{contents:`export {availableSitemap} from './lib/server/public-sitemap';
    export {followPublicLink} from './components/public-link';
    export {homepageMetadata,flagship} from './lib/homepage-art';`,resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent',
});
const {availableSitemap,followPublicLink,homepageMetadata,flagship}=await import(
  'data:text/javascript;base64,'+Buffer.from(text).toString('base64'));

test('public sitemap advertises the actual canonical routes once and encodes project slugs',async()=>{
  const response=await availableSitemap(async()=>({projects:[{slug:'vamps'},{slug:'lammbs'},{slug:'vamps'},{slug:'<space & /test>'}]}));
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/^application\/xml/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.text();
  assert.deepEqual([...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(result=>result[1]), [
    'https://rmtlaunch.fun/','https://rmtlaunch.fun/calendar','https://rmtlaunch.fun/guide',
    'https://rmtlaunch.fun/projects/vamps','https://rmtlaunch.fun/projects/lammbs',
    'https://rmtlaunch.fun/projects/%3Cspace%20%26%20%2Ftest%3E',
  ]);
});

test('a catalog failure keeps crawlers from replacing the sitemap with an empty list',async()=>{
  const response=await availableSitemap(async()=>{throw Error('private connection detail');});
  assert.equal(response.status,503);
  assert.equal(response.headers.get('retry-after'),'300');
  assert.equal(await response.text(),'');
});

test('public link enhancement preserves modified clicks and lets basic clicks open the existing experience',()=>{
  let followed=0,prevented=0;
  const event={button:0,preventDefault(){prevented+=1;}};
  for(const mods of [{button:1},{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{defaultPrevented:true}]){
    followPublicLink({...event,...mods},()=>followed++);
  }
  assert.equal(followed,0);
  assert.equal(prevented,0);
  followPublicLink(event,()=>followed++);
  assert.equal(followed,1);
  assert.equal(prevented,1);
});

test('homepage metadata describes the catalog while preserving the selected share art',()=>{
  const meta=homepageMetadata(flagship);
  assert.match(meta.title,/Robinhood Chain Projects/);
  assert.match(meta.description,/independent/);
  assert.equal(meta.alternates.canonical,'https://rmtlaunch.fun/');
  assert.equal(meta.openGraph.images[0].url,'https://rmtlaunch.fun/social/home-flagship-v1.jpg');
});
