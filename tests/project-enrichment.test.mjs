import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {collectProject,pageMetadata,validTarget,publicAddress} from '../scripts/collect-project-evidence.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({
  stdin:{contents:"export {enrichProject} from './lib/project-enrichment'; export {seedProjects} from './lib/catalog';",resolveDir:root},
  bundle:true,write:false,platform:'node',format:'esm',target:'node24',
});
const {enrichProject,seedProjects}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const home='https://studio.example.org/';
const social='https://x.com/ExampleStudio';
const gallery='https://studio.example.org/art';
const collection='https://opensea.io/collection/example-studio';
const address='0x'+'1'.repeat(40);
const explorer='https://robinhoodchain.blockscout.com/token/'+address;
const project={
  id:'example-studio',name:'Example Studio',category:'Community',description:'Approved public listing text.',
  source:'community',claimed:false,website:home,officialXProfile:social,launchUrl:gallery,launchLabel:'Visit',
  accent:'#c6ff42',links:[{label:'Website',url:home},{label:'Visit',url:gallery,type:'Gallery'},
    {label:'X',url:social},{label:'Explorer',url:explorer,type:'Explorer'}],
  collections:[{name:'Example collection',url:collection,chain:'Robinhood Chain'}],
};

test('the three researched projects use current first-party evidence, approved experience artwork and approved X identities',()=>{
  for(const [id,experience,url,text,count] of [
    ['moneymomos',/SteamVille/,'https://elitecompound.moneymomos.com/',/100 hand-drawn Elites/,6],
    ['wif-outlaws',/registered agent/,'https://www.robinwifhat.com/agents',/spending limits/,1],
    ['bored-traders',/committed onchain/,'https://boredtrader.co/art',/10,000 Bored Trader pieces/,1],
  ]) {
    const listing=seedProjects.find(item=>item.id===id);
    const view=enrichProject(listing);
    assert.equal(view.hasVerifiedEvidence,true);
    assert.match(view.shortDescription,experience);
    for(const key of ['shortDescription','experienceIntro','communityIntro','categoryLabel']) assert.equal(view.sources[key].kind,'website');
    assert.equal(view.destinations.filter(link=>link.image).length,count);
    assert.match(view.destinations.find(link=>link.url===url).copy,text);
    assert.deepEqual(view.sources['copy:'+url],{kind:'website',url});
    assert.equal(view.sources['label:'+listing.officialXProfile].kind,'x');
    assert.equal(view.accent,listing.accent);
  }
});

test('fields follow source priority; owner requires a verified claim plus owner-authored content, and an explicit override wins',()=>{
  const evidence=[['explorer',explorer],['opensea',collection],['x',social],['website',home]]
    .map(([kind,url])=>({kind,url,shortDescription:kind+' copy'}));
  for(let count=1;count<=4;count++) assert.equal(enrichProject(project,evidence.slice(0,count)).shortDescription,evidence[count-1].shortDescription);
  for(const changes of [{claimed:true},{contentOrigin:'owner'},{claimed:true,contentOrigin:'admin'}]) {
    assert.equal(enrichProject({...project,...changes},evidence).sources.shortDescription.kind,'website');
  }
  const owner={...project,claimed:true,contentOrigin:'owner',links:[{label:'Studio Atlas',url:gallery}]};
  const ownerView=enrichProject(owner,[{kind:'website',url:home,shortDescription:'Source summary',destinations:{[gallery]:{label:'Archive'}}}]);
  assert.deepEqual(ownerView.sources.shortDescription,{kind:'owner'});
  assert.equal(ownerView.shortDescription,project.description);
  assert.equal(ownerView.destinations[0].label,'Studio Atlas');
  const override=enrichProject({...owner,presentation:{shortDescription:'Reviewed text',labels:{[gallery]:'Art index'},supporting:{[gallery]:'/approved.webp'},accent:'#fac041'}},evidence);
  assert.equal(override.shortDescription,'Reviewed text');
  assert.equal(override.destinations[0].label,'Art index');
  assert.equal(override.destinations[0].image,'/approved.webp');
  assert.equal(override.accent,'#fac041');
  assert.deepEqual(override.sources.shortDescription,{kind:'admin'});
});

test('replacing approved sources suppresses stale summaries, unknown hosts and removed destinations',()=>{
  const evidence=[
    {kind:'website',url:home,shortDescription:'Gallery copy',destinations:{[gallery]:{label:'Art index'}}},
    {kind:'website',url:'https://outside.example.org/',shortDescription:'External claim'},
    {kind:'x',url:'https://outside.example.org/profile',shortDescription:'Unofficial X'},
    {kind:'opensea',url:'https://opensea.io/collection/unlisted',shortDescription:'Wrong collection'},
    {kind:'explorer',url:explorer+'/unlisted',shortDescription:'Wrong explorer'},
  ];
  const view=enrichProject({...project,links:[{url:home,label:'Website'}],launchUrl:home,officialXProfile:'https://outside.example.org/profile'},evidence);
  assert.equal(view.shortDescription,project.description);
  assert.deepEqual(view.destinations.map(link=>link.url),[home,collection]);
  const moved=enrichProject({...project,website:'https://new.example.org/'},evidence);
  assert.equal(moved.hasVerifiedEvidence,false);
  assert.equal(moved.shortDescription,project.description);
});

test('new published projects derive presentation immediately and an X-only record gains no inferred experiences, artwork or links',()=>{
  const fresh=enrichProject(project);
  assert.equal(fresh.categoryLabel,'Community · Robinhood Chain');
  assert.match(fresh.communityIntro,/@ExampleStudio/);
  assert.equal(fresh.destinations.find(link=>link.url===home).label,'Example Studio website');
  const onlyX=enrichProject({...project,id:'constructor',website:'',collections:[],launchUrl:social,links:[{label:'X',url:social,type:'Social'}]});
  assert.equal(onlyX.destinations.length,1);
  assert.equal(onlyX.destinations[0].image,undefined);
  assert.equal(onlyX.shortDescription,project.description);
  assert.equal(onlyX.experienceIntro,'');
  assert.equal(onlyX.hasVerifiedEvidence,false);
  assert.equal(onlyX.sources.shortDescription.kind,'listing');
});

test('collector uses only published first-party links, profile identity and matching collection and token API responses',async()=>{
  const requested=[];
  const snapshots=await collectProject({...project,links:[...project.links,{url:'https://elsewhere.example.org/',label:'Partner'}]},async(url,json)=>{
    requested.push(url);
    if(url===home || url===gallery) return '<head><title>Studio Gallery</title><meta name="description" content="Public &amp; independent art."></head><a href="https://undisclosed.example.org/">Studio partners</a>';
    if(url===social) return '<head><title>Example Studio (@ExampleStudio) / X</title><meta name="description" content="Illustrations from the studio."></head>';
    assert.equal(json,true);
    if(url.startsWith('https://api.opensea.io/')) return {collection:'example-studio',name:'Studio',description:'Portrait collection.'};
    if(url.startsWith('https://robinhoodchain.blockscout.com/')) return {address_hash:address,type:'ERC-721',name:'Studio portraits'};
    assert.fail('Unexpected fetch');
  });
  assert.deepEqual(snapshots.map(s=>s.kind),['website','website','x','opensea','explorer']);
  assert.equal(snapshots[0].shortDescription,'Public & independent art.');
  assert.equal(snapshots[2].destinations[social].label,'@ExampleStudio');
  assert.equal(snapshots[2].shortDescription,'Illustrations from the studio.');
  assert.match(snapshots[4].destinations[explorer].copy,/ERC-721/);
  assert.ok(!requested.some(url=>/elsewhere|undisclosed/.test(url)));
  const unavailable=await collectProject(project,async(url,json)=>json ? {collection:'other',address_hash:'different'} : '<head><title>Just a moment...</title></head>');
  assert.deepEqual(unavailable.map(s=>s.kind),['x']);
  assert.equal(unavailable[0].shortDescription,undefined);
});

test('source extraction drops active content and challenge pages; network boundaries exclude private and special-use addresses',()=>{
  const meta=pageMetadata('<head><!-- <meta name="description" content="Comment"> --><script><meta name="description" content="Script"></script><meta content="Reviewed public text" name="description"><meta name="theme-color" content="#111111"><title>Project</title></head>');
  assert.deepEqual(meta,{title:'Project',description:'Reviewed public text',accent:''});
  for(const url of ['https://localhost/','http://example.org/','https://example.org:8080/','https://user:pass@example.org/','https://[::1]/','https://127.0.0.1/','https://lan.internal/']) assert.equal(validTarget(url),null,url);
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.0.1','100.64.5.20','fc00::1','::ffff:127.0.0.1']) assert.equal(publicAddress(ip),false,ip);
  assert.equal(publicAddress('1.1.1.1'),true);
});
