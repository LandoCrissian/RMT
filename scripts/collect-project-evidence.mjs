import {suggestCategories} from '../lib/category-suggestions.mjs';
import {lookup} from 'node:dns/promises';
import {BlockList, isIP} from 'node:net';
import https from 'node:https';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// All targets come from the public directory. Validate again and pin a public
// IPv4 result for this connection, including each followed redirect.
const reserved = new BlockList();
for (const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) reserved.addSubnet(address,prefix);
export function validTarget(value) {
  try {
    const u=new URL(value);
    if (u.protocol!=='https:' || u.username || u.password || u.port || isIP(u.hostname) || !/^[a-z0-9.-]+\.[a-z]{2,63}$/i.test(u.hostname) ||
        /\.(?:local|localhost|internal|test|invalid|onion|example)$/i.test(u.hostname)) return null;
    return u;
  } catch {return null;}
}
export const publicAddress = address=>isIP(address)===4 && !reserved.check(address);
export async function readPublic(value,json=false,hops=0) {
  const u=validTarget(value);
  if (!u) throw Error('Invalid destination');
  let lookupTimer;
  let records;
  try {
    records=await Promise.race([lookup(u.hostname,{family:4,all:true}),
      new Promise((_,reject)=>{lookupTimer=setTimeout(()=>reject(Error('DNS lookup timed out')),2500);})]);
  } finally {clearTimeout(lookupTimer);}
  if (!records.length || !records.every(row=>publicAddress(row.address))) throw Error('Unavailable address');
  const bodyLimit=json ? 2_000_000 : 512_000;
  const response=await new Promise((resolve,reject)=>{
    const request=https.get(u,{agent:false,family:4,autoSelectFamily:false,
      lookup:(_host,_opts,cb)=>cb(null,records[0].address,4),
      headers:{'user-agent':'RMT-Directory/1.0 (+https://rmtlaunch.fun)',accept:json?'application/json':'text/html','accept-encoding':'identity'},
      signal:AbortSignal.timeout(6500)},resolve);
    request.on('error',reject);
  });
  if (response.statusCode>=300 && response.statusCode<400 && response.headers.location) {
    response.destroy();
    const target=new URL(response.headers.location,u);
    if (hops>=2 || target.hostname.replace(/^www\./,'')!==u.hostname.replace(/^www\./,'')) throw Error('Outside source');
    return readPublic(target.href,json,hops+1);
  }
  if (response.statusCode!==200 || !(json ? /application\/(?:[\w.+-]+\+)?json/i : /text\/html/i).test(response.headers['content-type'] || '')) {
    response.destroy(); throw Error('Unavailable content');
  }
  const chunks=[]; let size=0;
  try {
    for await (const chunk of response) {
      size+=chunk.length;
      if (size>bodyLimit) {
        if (json) throw Error('Oversized response');
        chunks.push(chunk.subarray(0,Math.max(0,bodyLimit-size+chunk.length)));break;
      }
      chunks.push(chunk);
    }
  } finally {response.destroy();}
  const text=Buffer.concat(chunks).toString('utf8');
  return json?JSON.parse(text):text;
}

function plain(value,max) {
  if(typeof value!=='string') return '';
  const text=value.replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);|&apos;/gi,"'").replace(/&nbsp;/gi,' ').replace(/\s+/g,' ').trim();
  // Skip markup, entity fragments and overlong/truncated assertions.
  return text.length<=max && !/[<>\u0000-\u001f]|&(?:#\d+|\w+);/.test(text) ? text : '';
}
function sourceHead(html) {
  return html.split(/<\/head\s*>|<body[\s>]/i,1)[0].replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'');
}
function tagAttributes(tag) {
  return new Map([...tag.matchAll(/\s([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]??m[4]]));
}
// Suggestions remain in the review artifact. A website cannot instruct the
// Worker to fetch an arbitrary image or publish a change to a listing.
function artworkCandidates(html,website) {
  const found=new Map();
  for(const tag of sourceHead(html).match(/<(?:meta|link)\b[^>]{1,4096}>/gi) ?? []) {
    const attrs=tagAttributes(tag);
    const prop=(attrs.get('property')||attrs.get('name')||'').toLowerCase();
    const rel=(attrs.get('rel')||'').toLowerCase().split(/\s+/);
    const kind=prop==='og:image' || prop==='twitter:image' ? 'share' : rel.includes('apple-touch-icon') || rel.includes('icon') ? 'logo' : '';
    const value=attrs.get(kind==='share'?'content':'href');
    if(!kind || found.has(kind) || !value || value.length>512) continue;
    try {
      const target=validTarget(new URL(value,website).href);
      if(target?.origin===website.origin && !target.search && !target.hash && /\.(?:png|jpe?g|webp)$/i.test(target.pathname))
        found.set(kind,{kind,url:target.href});
    } catch { /* Unsupported URLs are omitted from the review. */ }
  }
  return [...found.values()];
}
export function pageMetadata(html) {
  const head=sourceHead(html);
  const values=new Map();
  for(const tag of head.match(/<meta\b[^>]{1,4096}>/gi) ?? []) {
    const attributes=tagAttributes(tag);
    const key=(attributes.get('property') || attributes.get('name'))?.toLowerCase();
    if (key && !values.has(key)) values.set(key,attributes.get('content'));
  }
  const theme=plain(values.get('theme-color'),7);
  const rgb=/^#[a-f\d]{6}$/i.test(theme) ? theme.slice(1).match(/../g).map(pair=>parseInt(pair,16)) : [];
  const accent=rgb.length && Math.max(...rgb)-Math.min(...rgb)>38 && .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>100 ? theme : '';
  const description=plain(values.get('description'),260) || plain(values.get('og:description'),260);
  const title=plain(values.get('og:title'),80) || plain(head.match(/<title\b[^>]*>([\s\S]{1,200}?)<\/title\s*>/i)?.[1],80);
  return {title,description,accent};
}
function usable(text) {
  return Boolean(text && !/access denied|captcha|attention required|just a moment|verify you are human|javascript is not available|sign in to x|log in to x/i.test(text));
}

export async function collectProject(project,fetchPublic=readPublic) {
  const snapshots=[];
  const website=validTarget(project.website), social=validTarget(project.officialXProfile);
  const links=project.links || [];
  if(website && !['opensea.io','x.com','twitter.com'].includes(website.hostname)){
    const pages=[...new Set([project.website,...links.map(link=>link.url)])].filter(value=>{
      const u=validTarget(value);
      return u && (u.hostname===website.hostname || u.hostname.endsWith('.'+website.hostname));
    }).slice(0,10);
    for(const url of pages) {
      try {
        const html=await fetchPublic(url);
        const meta=pageMetadata(html);
        if(!usable(meta.title) && !usable(meta.description)) continue;
        if((meta.title && !usable(meta.title)) || (meta.description && !usable(meta.description))) continue;
        const snapshot={kind:'website',url};
        if(url===project.website) {
          if(meta.description) snapshot.shortDescription=meta.description;
          if(meta.accent) snapshot.accent=meta.accent;
          if(project.source==='community' && (!project.logo || project.cover==='community')) {
            const candidates=artworkCandidates(html,website);
            if(candidates.length) snapshot.artworkCandidates=candidates;
          }
        }
        if(links.some(link=>link.url===url) && (meta.title||meta.description)) snapshot.destinations={[url]:{...(meta.title ? {label:meta.title} : {}),...(meta.description ? {copy:meta.description} : {})}};
        if(Object.keys(snapshot).length>2) snapshots.push(snapshot);
      } catch { /* A slow, moved or restricted site contributes no candidate. */ }
    }
  }
  if(social && /^(?:www\.)?(?:twitter|x)\.com$/i.test(social.hostname) && /^\/[a-z\d_]{1,15}\/?$/i.test(social.pathname)){
    const handle=social.pathname.split('/')[1];
    const snapshot={kind:'x',url:project.officialXProfile,destinations:{[project.officialXProfile]:{label:'@'+handle,copy:'Official project posts from @'+handle+'.'}}};
    // X often returns only a generic shell. A public profile bio is a review
    // candidate only when its title identifies this exact approved handle.
    try {
      const meta=pageMetadata(await fetchPublic(project.officialXProfile));
      const handles=meta.title.match(/@[a-z0-9_]+/gi) || [];
      if(handles.some(value=>value.toLowerCase()==='@'+handle.toLowerCase()) && usable(meta.description))
        snapshot.shortDescription=meta.description;
    } catch { /* The already published profile URL still establishes the handle. */ }
    snapshots.push(snapshot);
  }
  for (const collection of (project.collections || []).slice(0,2)) {
    const u=validTarget(collection.url), slug=u?.pathname.match(/^\/collection\/([a-zA-Z0-9_-]{1,150})\/?$/)?.[1];
    if (u?.hostname!=='opensea.io' || !slug) continue;
    try {
      const info=await fetchPublic('https://api.opensea.io/api/v2/collections/'+slug,true);
      if(info.collection!==slug || !plain(info.name,100)) continue;
      const description=plain(info.description,260);
      if(description && usable(description)) snapshots.push({kind:'opensea',url:collection.url,shortDescription:description});
    } catch { /* Public provider limits must not block the other sources. */ }
  }
  for(const link of links.filter(item=>/explorer/i.test(item.type ?? '')).slice(0,2)){
    const u=validTarget(link.url),address=u?.pathname.match(/^\/(?:token|address)\/(0x[a-fA-F0-9]{40})\/?$/)?.[1];
    if(u?.hostname!=='robinhoodchain.blockscout.com' || !address) continue;
    try {
      const token=await fetchPublic('https://robinhoodchain.blockscout.com/api/v2/tokens/'+address,true);
      const name=plain(token.name,80);
      if(token.address_hash?.toLowerCase()!==address.toLowerCase() || !name || !/^ERC-(?:721|1155)$/.test(token.type)) continue;
      snapshots.push({kind:'explorer',url:link.url,destinations:{[link.url]:{label:'Collection contract',copy:name+' is registered as an '+token.type+' contract on Robinhood Chain.'}}});
    } catch { /* Leave unverified contract metadata out. */ }
  }
  return snapshots.map(row=>{
    const suggestions=suggestCategories([row]);
    return suggestions.length?{...row,categorySuggestions:suggestions}:row;
  });
}

async function main(){
  const [output='source-review.json',...selected]=process.argv.slice(2);
  const existing=JSON.parse(await fs.readFile(new URL('../lib/reviewed-source-metadata.json',import.meta.url),'utf8'));
  const catalog=await readPublic('https://rmtlaunch.fun/api/catalog',true);
  if(!Array.isArray(catalog.projects) || !catalog.projects.length) throw Error('Published catalog unavailable');
  const projects=catalog.projects.filter(project=>!selected.length || selected.includes(project.id));
  const result=new Map(Object.entries(existing));
  // Bound each run while allowing a growing catalog to rotate through batches.
  const offset=selected.length ? 0 : Math.floor(Date.now()/(7*86400000))*100 % projects.length;
  const batch=[...projects.slice(offset),...projects.slice(0,offset)].slice(0,100);
  for(let index=0;index<batch.length;index+=4){
    await Promise.all(batch.slice(index,index+4).map(async project=>{
      const found=await collectProject(project);
      if(!found.length) return;
      const keys=new Set(found.map(row=>row.kind+' '+row.url));
      const old=(result.get(project.id) || []).filter(row=>!keys.has(row.kind+' '+row.url));
      result.set(project.id,[...found,...old]);
    }));
  }
  const ordered=Object.fromEntries([...result].sort(([a],[b])=>a.localeCompare(b)));
  const toJson=value=>JSON.stringify(value,null,2)+'\n';
  if(toJson(ordered)===toJson(existing)) {console.log('Reviewed sources are up to date.'); return;}
  await fs.writeFile(output,toJson(ordered));
  console.log('Candidate evidence written for review. Checked '+batch.length+' published listings.');
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) await main();
