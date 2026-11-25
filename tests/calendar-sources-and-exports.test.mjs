import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire,Module} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import sharp from 'sharp';
import {collectCalendar,eventTime,sourceEvents} from '../scripts/collect-calendar-suggestions.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const official='https://studio.example.org/';
const project={id:'curated-studio',name:'Studio',website:official,links:[]};
const now=Date.UTC(2025,0,1);
const event={'@type':'Event',name:'Community listening room',description:'Listen and meet the composer.',
  url:official+'events/listening-room',startDate:'2025-04-04T21:30:00+05:30',endDate:'2025-04-04T22:30:00+05:30'};
const page=(...items)=>'<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':items})+'</script>';
const {outputFiles}=await build({stdin:{contents:"export * from './lib/event-export';export * from './lib/server/render-event-card';",resolveDir:root},
  absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['next/og','react/jsx-runtime']});
const mod=new Module(root+'calendar-export-test.cjs');mod.filename=root+'calendar-export-test.cjs';mod.paths=require.resolve.paths('sharp');mod._compile(outputFiles[0].text,mod.filename);
const {calendarExport,renderEventCard,eventCardTime}=mod.exports;
const published={...event,id:'public-1',projectId:'studio',title:event.name,projectName:'Studio',
  startsAt:eventTime(event.startDate),endsAt:eventTime(event.endDate),status:'published',updatedAt:now};

test('strict explicit instants preserve offsets and reject ambiguities, invalid dates and unknown timezone',()=>{
  assert.equal(eventTime(event.startDate),Date.UTC(2025,3,4,16));
  assert.equal(eventTime('2025-11-02T01:30:00-04:00')+3600000,eventTime('2025-11-02T01:30:00-05:00'));
  for(const v of ['2025-04-04','2025-04-04T13:00','2025-02-30T13:00Z','2025-04-04T24:00Z','2025-04-04T13:00:00-00:00','2025-04-04T13:00:00+16:00'])assert.equal(eventTime(v),null,v);
});

test('only attributed, scheduled first-party structured events with confirmed timestamps yield review drafts',()=>{
  const [found]=sourceEvents(project,official,page(event),now);
  assert.equal(found.projectId,project.id);assert.equal(found.sourceUrl,official);assert.equal(found.startsAt,Date.UTC(2025,3,4,16));assert.match(found.sourceKey,/^[0-9a-f]{64}$/);
  for(const bad of [{eventStatus:'https://schema.org/EventCancelled'},{eventSchedule:{}},{url:'https://elsewhere.net/event'},{startDate:'April 4'},{startDate:'2025-04-04'},{endDate:'2025-04-04T16:00:00Z'},{description:'<img src=x>'},{startDate:'2024-04-04T16:00Z',endDate:null}]){
    assert.equal(sourceEvents(project,official,page({...event,...bad}),now).length,0);
  }
  assert.equal(sourceEvents(project,official,'<!-- '+page(event)+' -->',now).length,0);
  assert.equal(sourceEvents(project,'https://other.org/',page(event),now).length,0);
});

test('collector ignores private and external destinations, isolates fetch failures and suppresses conflicting repeated-event URLs',async()=>{
  const p={...project,links:[{url:official+'events'},{url:official+'calendar'},{url:'https://elsewhere.net/events'}]};
  const calls=[];
  const result=await collectCalendar([p,{id:'another',website:'https://opensea.io/collection/other'}],async url=>{
    calls.push(url);if(url.endsWith('calendar'))throw Error('unavailable');
    return page(event,...(url===official?[]:[{...event,name:'Changed schedule'}]));
  },now);
  assert.deepEqual(calls,[official,official+'events',official+'calendar']);assert.deepEqual(result,{version:1,suggestions:[]});
});

test('iCalendar UTC, stable identity, escaping and UTF-8 folding survive re-import in another timezone',()=>{
  const title='🎟️'.repeat(34)+', first; part\\two\r\nATTENDEE:test';
  const ics=calendarExport({...published,title});
  for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75,line);
  assert.ok(!/(?<!\r)\n/.test(ics));
  const unfolded=ics.replace(/\r\n /g,'');
  assert.match(unfolded,/DTSTART:20250404T160000Z\r\nDTEND:20250404T170000Z/);
  assert.ok(unfolded.includes('\\, first\\; part\\\\two\\nATTENDEE:test'));
  assert.ok(!unfolded.includes('\r\nATTENDEE:'));
  assert.ok(unfolded.includes('URL:https://rmtlaunch.fun/events/public-1'));
  assert.match(ics,/UID:public-1@rmtlaunch.fun/);
  const cancelled=calendarExport({...published,endsAt:null,updatedAt:now+1000,status:'cancelled'});
  assert.ok(!cancelled.includes('DTEND:'));assert.match(cancelled,/STATUS:CANCELLED/);
  assert.equal(ics.split('UID:')[1].split('\r\n')[0],cancelled.split('UID:')[1].split('\r\n')[0]);
  assert.match(eventCardTime(published.startsAt),/4:00 PM UTC/);
});

test('project-branded crawler artwork is a real 1200 × 630 PNG, with distinct cancelled and revised cards',async()=>{
  const logo=await readFile(new URL('../public/projects/apex-rising-69f95abc.png',import.meta.url));
  const art='data:image/png;base64,'+logo.toString('base64');
  const fresh=Buffer.from(await renderEventCard(published,art));
  const changed=Buffer.from(await renderEventCard({...published,status:'cancelled',title:'An updated event title'},art));
  assert.notDeepEqual(fresh,changed);
  const {width,height,format}=await sharp(fresh).metadata();assert.deepEqual({width,height,format},{width:1200,height:630,format:'png'});
});


test('the approved APEX season requires a matching source, scoring rules, UTC window and valid calendar weekdays',()=>{
  const apex={id:'community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194',website:'https://apexrising.io/'};
  const url=apex.website+'season';
  const html='<h1>Season 1: The Ascent</h1><p>Season window</p><p>Mon Nov 9, 2026, 22:00 UTC to Mon Dec 7, 2026, 22:00 UTC</p><p>Play free-play runs of the listed skill games. There is no entry fee.</p>';
  const now=Date.UTC(2026,10,24), [event]=sourceEvents(apex,url,html,now);
  assert.equal(event.startsAt,Date.UTC(2026,10,9,22));assert.equal(event.endsAt,Date.UTC(2026,11,7,22));
  assert.equal(event.typeId,'gaming');assert.equal(event.sourceUrl,url);
  for(const invalid of [html.replace('Mon Nov 9','Fri Nov 9'),html.replaceAll('UTC','ET'),html.replace('no entry fee','an entry fee'),'<script>'+html+'</script>'])
    assert.equal(sourceEvents(apex,url,invalid,now).length,0);
  assert.equal(sourceEvents(apex,url,html,Date.UTC(2026,11,8)).length,0);
  assert.equal(sourceEvents({...apex,id:'copy'},url,html,now).length,0);
  assert.equal(sourceEvents({...project,website:official+'other-studio'},official,page(event),now).length,0);
});
