import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
const endpoint='https://rmtlaunch.fun/api/automation/source-review';
async function file(path,optional=false){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(optional&&e.code==='ENOENT')return {};throw e;}}
function describe(row){
 const lines=[];
 if(row.shortDescription)lines.push('Description · '+row.shortDescription);
 if(row.accent)lines.push('Brand color · '+row.accent);
 for(const [url,value] of Object.entries(row.destinations??{}))lines.push([url,value.label,value.copy].filter(Boolean).join(' · '));
 for(const art of row.artworkCandidates??[])lines.push('Artwork candidate · '+(typeof art==='string'?art:art.kind+' · '+art.url));
 for(const category of row.categorySuggestions??[])lines.push('Suggested category · '+(typeof category==='string'?category:category.id+' · '+category.evidence));
 return lines.join('\n').slice(0,3500);
}
export function deliveries(calendar,metadata,reviewed){
 const rows=calendar.suggestions.map(event=>({kind:'calendar',projectId:event.projectId,sourceUrl:event.sourceUrl,event}));
 for(const [projectId,sources] of Object.entries(metadata)){
  for(const row of sources){
   if((reviewed[projectId]??[]).some(old=>isDeepStrictEqual(old,row)))continue;
   const evidence=describe(row);if(evidence)rows.push({kind:'enrichment',projectId,sourceUrl:row.url,evidence});
  }
 }
 return rows;
}
async function identity(){
 const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience',endpoint);
 const r=await fetch(url,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Cannot obtain workflow identity (HTTP '+r.status+').');
 return (await r.json()).value;
}
async function main(){
 const rows=deliveries(await file('calendar-suggestions.json'),await file('source-review.json',true),await file('lib/reviewed-source-metadata.json'));
 const counts={queued:0,unchanged:0,expired:0};let token,expires=0;
 for(const row of rows){
  for(let attempt=0;;attempt++){
   if(Date.now()>expires){token=await identity();expires=Date.now()+120000;}
   let r;try{r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(row),signal:AbortSignal.timeout(20000)});}catch{if(attempt>=2)throw Error('Source delivery connection failed.');}
   if(r?.ok){const {result}=await r.json();if(!Object.hasOwn(counts,result))throw Error('Unexpected delivery response.');counts[result]++;break;}
   if(r&&(r.status<500&&r.status!==429||attempt>=2))throw Error('Delivery failed for '+row.projectId+' '+row.kind+' (HTTP '+r.status+').');
   await new Promise(resolve=>setTimeout(resolve,1000*2**attempt));
  }
 }
 console.log('Private source queue delivery',JSON.stringify(counts));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
