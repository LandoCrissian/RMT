import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {readPublic,validTarget} from './collect-project-evidence.mjs';

const unsupportedHost=/(?:^|\.)(?:opensea\.io|x\.com|twitter\.com|discord\.(?:gg|com)|instagram\.com|github\.com|linktr\.ee)$/i;
const horizon=366*86400000;
const apexId='community-a03d19b5-8cb0-47b6-97a8-23ecf5e5f194';
const apexSeason='https://apexrising.io/season';
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export function eventTime(value) {
  if(typeof value!=='string')return null;
  const m=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|[+-](\d\d):(\d\d))$/.exec(value);
  if(!m||+m[2]>23||+m[3]>59||+(m[4]??0)>59||+m[6]>14||+m[7]>59||(+m[6]===14&&+m[7]!==0)||m[5]==='-00:00')return null;
  const day=new Date(m[1]+'T00:00:00Z');
  if(!Number.isFinite(+day)||day.toISOString().slice(0,10)!==m[1])return null;
  const ms=Date.parse(value);
  return Number.isFinite(ms)?ms:null;
}

function textField(value,max) {
  if(typeof value!=='string'||/[<>\u0000-\u001f]/.test(value))return '';
  const text=value.trim().replace(/\s+/g,' ');
  return text.length<=max?text:'';
}

function officialUrl(value,site) {
  if(typeof value!=='string'||!value||value.length>500)return null;
  try{
    const dest=validTarget(new URL(value,site).href);
    if(!dest||dest.origin!==site.origin||dest.search||dest.hash||unsupportedHost.test(dest.hostname))return null;
    const prefix=site.pathname.replace(/\/$/,'');
    if(prefix && dest.pathname!==prefix && !dest.pathname.startsWith(prefix+'/'))return null;
    return dest;
  }catch{return null;}
}

function apexSeasonTime(value) {
  const parts=/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) ([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{2}:\d{2}) UTC$/.exec(value);
  if(!parts)return null;
  const month=months.indexOf(parts[2])+1;
  const ms=eventTime(parts[4]+'-'+String(month).padStart(2,'0')+'-'+parts[3].padStart(2,'0')+'T'+parts[5]+'Z');
  return ms!==null && days[new Date(ms).getUTCDay()]===parts[1]?ms:null;
}
function officialSeason(project,html,now) {
  // This publisher exposes the season window as two explicit UTC instants in its rules.
  // Require both, the named season heading, and the publisher's scoring instructions.
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,'');
  const title=textField(html.match(/<h1\b[^>]*>([^<>]+)<\/h1>/i)?.[1],100);
  const season=/^Season (\d{1,3}): .+$/i.exec(title);
  const body=html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const window=/Season window ([^<]{1,42}? UTC) to ([^<]{1,42}? UTC)\b/.exec(body);
  if(!season||!window||!body.includes('Play free-play runs of the listed skill games')||!body.includes('There is no entry fee.'))return [];
  const startsAt=apexSeasonTime(window[1]),endsAt=apexSeasonTime(window[2]);
  if(startsAt===null||endsAt===null||endsAt<=startsAt||endsAt<now||startsAt>now+horizon)return [];
  return [{projectId:project.id,title,description:'Play the listed skill games in free-play mode to earn points on the season leaderboard.',
    startsAt,endsAt,destination:apexSeason,sourceUrl:apexSeason,typeId:'gaming',access:'Free entry. Check the official season rules for eligibility.',
    sourceKey:createHash('sha256').update(project.id+'\n'+apexSeason+'\nSeason '+season[1]).digest('hex')}];
}

export function sourceEvents(project,page,html,now=Date.now()) {
  const site=validTarget(project.website);
  if(!site||!officialUrl(page,site))return [];
  const rows=[];
  const noComments=html.slice(0,512000).replace(/<!--[\s\S]*?-->/g,'');
  if(project.id===apexId && page===apexSeason && site.origin==='https://apexrising.io')
    rows.push(...officialSeason(project,noComments,now));
  for(const match of noComments.matchAll(/<script\b([^>]{1,650})>([\s\S]*?)<\/script\s*>/gi)){
    if(!/\stype\s*=\s*["']application\/ld\+json["']/i.test(match[1])||match[2].length>65536)continue;
    let document;
    try{document=JSON.parse(match[2]);}catch{continue;}
    const records=Array.isArray(document)?document:[document];
    for(const container of records.slice(0,30)){
      if(!container||typeof container!=='object')continue;
      if(!['https://schema.org','https://schema.org/','http://schema.org','http://schema.org/'].includes(container['@context']))continue;
      const events=Array.isArray(container['@graph'])?container['@graph']:[container];
      for(const entry of events.slice(0,50)){
        if(entry?.['@type']!=='Event'||entry.eventSchedule||entry.previousStartDate||entry.subEvent)continue;
        if(entry.eventStatus&&!['https://schema.org/EventScheduled','http://schema.org/EventScheduled','EventScheduled'].includes(entry.eventStatus))continue;
        const title=textField(entry.name,100),description=textField(entry.description,900);
        const startsAt=eventTime(entry.startDate),endsAt=entry.endDate==null?null:eventTime(entry.endDate);
        // A dedicated public URL gives the reviewer a stable, recheckable identity.
        const destination=officialUrl(entry.url,site);
        if(!title||!description||!destination||startsAt===null||startsAt>now+horizon||
          (entry.endDate!=null&&(endsAt===null||endsAt<=startsAt))||(endsAt??startsAt)<now)continue;
        const sourceKey=createHash('sha256').update(project.id+'\n'+destination.href).digest('hex');
        rows.push({projectId:project.id,title,description,startsAt,endsAt,destination:destination.href,
          sourceUrl:page,typeId:'community',access:'Check the official event page for entry requirements.',sourceKey});
      }
    }
  }
  return rows;
}

export async function collectCalendar(projects,read=readPublic,now=Date.now()) {
  const suggestions=new Map(),ambiguous=new Set();
  const offset=projects.length?Math.floor(now/(7*86400000))*48%projects.length:0;
  const batch=[...projects.slice(offset),...projects.slice(0,offset)].slice(0,48);
  for(const project of batch){
    const site=validTarget(project.website);
    if(!site||unsupportedHost.test(site.hostname))continue;
    const pages=new Set([site.href]);
    if(project.id===apexId&&site.origin==='https://apexrising.io')pages.add(apexSeason);
    for(const link of project.links??[]){
      const u=officialUrl(link.url,site);
      if(u&&/(?:^|\/)(?:events?|calendar|agenda)(?:\/|$)/i.test(u.pathname))pages.add(u.href);
    }
    for(const url of [...pages].slice(0,3)){
      try{
        for(const event of sourceEvents(project,url,await read(url),now)){
          const old=suggestions.get(event.sourceKey);
          if(old&&(old.startsAt!==event.startsAt||old.endsAt!==event.endsAt||old.title!==event.title)){
            ambiguous.add(event.sourceKey);continue;
          }
          suggestions.set(event.sourceKey,event);
        }
      }catch{/* Unavailable or unverifiable sources contribute no suggestions. */}
    }
  }
  return {version:1,suggestions:[...suggestions.values()].filter(e=>!ambiguous.has(e.sourceKey))
    .sort((a,b)=>a.startsAt-b.startsAt||a.sourceKey.localeCompare(b.sourceKey)).slice(0,100)};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const {projects}=await readPublic('https://rmtlaunch.fun/api/catalog',true);
  if(!Array.isArray(projects)||!projects.length)throw Error('Published catalog unavailable.');
  const result=await collectCalendar(projects);
  await writeFile(process.argv[2]||'calendar-suggestions.json',JSON.stringify(result,null,2)+'\n');
  console.log(result.suggestions.length+' dated calendar suggestions for review.');
}

