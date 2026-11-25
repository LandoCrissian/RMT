import {referrals,type Signal} from '../engagement';
import {InputError} from '../submission-validation';
import {catalog} from './repository';
import {publicProjectSql} from './control-visibility';
import {publicUpdateOwnershipGuard,publicUpdateProjectGuard,publicUpdateContentGuard} from './project-updates';
export const DAILY_EVENT_LIMIT=2000;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const identifier=/^[a-z0-9][a-z0-9_-]{0,127}$/i;
type Batch={session:string;browser:string;events:Signal[]};
const bad=()=>new InputError('Invalid analytics event.');
function obj(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw bad();return v as Record<string,unknown>;}
function parse(value:unknown):Batch{
  const v=obj(value);
  if(Object.keys(v).some(k=>!['session','browser','events'].includes(k))||typeof v.session!=='string'||typeof v.browser!=='string'||
     !uuid.test(v.session)||!uuid.test(v.browser)||!Array.isArray(v.events)||!v.events.length||v.events.length>24)throw bad();
  return {session:v.session,browser:v.browser,events:v.events.map(input=>{
    const e=obj(input),{kind,projectId,dimension}=e;
    if(Object.keys(e).some(k=>!['kind','projectId','dimension'].includes(k))||typeof projectId!=='string'||typeof dimension!=='string'||
      (kind==='visit'?projectId!=='':!identifier.test(projectId)))throw bad();
    switch(kind){
      case 'visit':case 'project_view':if(!referrals.some(s=>s===dimension))throw bad();break;
      case 'impression':case 'discovery_click':if(dimension!=='')throw bad();break;
      case 'share':if(!['native','copy','x'].includes(dimension))throw bad();break;
      case 'outbound':if(!/^[a-z0-9.-]{1,253}$/.test(dimension))throw bad();break;
      case 'announcement':if(!identifier.test(dimension))throw bad();break;
      default:throw bad();
    }
    return {kind,projectId,dimension};
  })};
}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
export function ignoreTelemetry(request:Request){
  const h=request.headers;
  return h.get('dnt')==='1'||h.get('sec-gpc')==='1'||/bot\b|crawler|spider|slurp|headless|preview|facebookexternalhit|curl\/|wget\//i.test(h.get('user-agent')??'');
}
export async function recordEngagement(db:D1Database,value:unknown,now=Date.now(),legacy=false){
  const {session,browser,events}=parse(value);
  const day=new Date(now).toISOString().slice(0,10);
  // An exhausted allocation also avoids expensive destination lookups.
  if(await db.prepare('SELECT 1 AS full FROM analytics_meta WHERE id=1 AND active_day=? AND accepted>=?').bind(day,DAILY_EVENT_LIMIT).first())return;
  const listing=events.some(e=>e.kind==='outbound')?await catalog(db):null;
  const statements=[db.prepare(`INSERT INTO analytics_meta(id,start_ms,active_day,accepted) VALUES(1,?,?,0)
    ON CONFLICT(id) DO UPDATE SET active_day=excluded.active_day,accepted=0 WHERE active_day<excluded.active_day`).bind(now,day)];
  const seen=new Set<string>();
  async function add(event:Signal){
    let {dimension}=event;const {kind,projectId}=event;
    if(kind==='outbound'){
      const p=listing?.projects.find(p=>p.id===projectId);
      if(!p)return;
      const urls=[p.website,p.launchUrl,...p.links.map(l=>l.url),...(p.collections??[]).map(c=>c.url)];
      if(!urls.some(url=>{try{return new URL(url).hostname===dimension;}catch{return false;}}))dimension='Other destination';
    }
    const eventKey=[day,session,kind,projectId,...(['visit','project_view'].includes(kind)?[]:[dimension])].join('|');
    if(seen.has(eventKey))return;seen.add(eventKey);
    const id=await hash(eventKey);
    const visitor=legacy?'':await hash([Math.floor(now/(90*86400000)),projectId,browser].join('|'));
    const conditions=['m.id=1 AND m.active_day=? AND m.accepted<?'];
    const params:(string|number)[]=[day,DAILY_EVENT_LIMIT];
    if(projectId){conditions.push(publicProjectSql('candidate.project_id'));}
    if(kind==='announcement'){
      conditions.push(`EXISTS(SELECT 1 FROM project_updates u WHERE u.id=candidate.dimension AND u.project_id=candidate.project_id
      AND u.status='approved' AND u.published_at IS NOT NULL AND ${publicUpdateOwnershipGuard('u')} AND ${publicUpdateContentGuard('u')} AND ${publicUpdateProjectGuard('u')})`);
    }
    if(kind==='discovery_click'){
      conditions.push('EXISTS(SELECT 1 FROM analytics_events WHERE id=?)');
      params.push(await hash([day,session,'impression',projectId,''].join('|')));
    }
    statements.push(db.prepare(`WITH candidate(id,day,project_id,kind,dimension,visitor,created_at) AS(SELECT ?,?,?,?,?,?,?)
      INSERT INTO analytics_events SELECT candidate.* FROM candidate,analytics_meta m WHERE ${conditions.join(' AND ')}
      ON CONFLICT(id) DO NOTHING`).bind(id,day,projectId,kind,dimension,visitor,now,...params));
  }
  for(const e of events){
    // A card click establishes that the card was shown even if the viewport callback is delayed.
    if(e.kind==='discovery_click')await add({...e,kind:'impression'});
    await add(e);
  }
  await db.batch(statements);
}
