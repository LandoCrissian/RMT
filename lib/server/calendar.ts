import type {Project} from '@/lib/catalog';
import {reminderDue} from '@/lib/calendar';
import type {CalendarType,CalendarEvent,EventFields} from '@/lib/calendar';
import {InputError} from '@/lib/submission-validation';
import {catalog,findPublicProject} from './repository';
import {publicProjectSql} from './control-visibility';
import {activeControlMemberSql} from './control-sql';

type Row={source?:string|null;id:string;project_id:string;draft:string;published:string|null;published_at:number|null;status:string;revision:number;featured:number;updated_at:number};
const visible=publicProjectSql('calendar_events.project_id');
const authorizedOwner="EXISTS(SELECT 1 FROM project_owners o WHERE o.project_id=? AND o.user_id=? AND o.status='active' AND "+activeControlMemberSql('o.user_id')+")";
const publicRows="published IS NOT NULL AND status<>'removed' AND "+visible;
export function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('Expected an object.');return value as Record<string,unknown>;
}
function string(v:unknown,max:number,required=true){if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw new InputError('Check the event details and field lengths.');return v.trim();}
function choices(p:Project){return [...new Set([p.artwork?.banner?.url,p.artwork?.logo?.url,p.cover,p.logo].filter((a):a is string=>!!a&&a.startsWith('/')&&!a.startsWith('//')))];}
export function official(raw:unknown,p:Project){
  const value=string(raw,2048);let u:URL;try{u=new URL(value);}catch{throw new InputError('Enter an official HTTPS destination.');}
  const links=[p.website,p.launchUrl,p.officialXProfile,...(p.collections??[]).map(c=>c.url),...p.links.map(l=>l.url)].filter(Boolean);
  if(u.protocol!=='https:'||u.username||u.password||!links.some(link=>{try{const v=new URL(link!);return u.origin===v.origin&&(u.pathname===v.pathname||u.pathname.startsWith(v.pathname.replace(/\/$/,'')+'/'));}catch{return false;}}))throw new InputError('Use a destination on the reviewed project listing.');
  return u.href;
}
function timestamp(v:unknown){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<=0||v>4_102_444_800_000)throw new InputError('Enter a valid date and time.');return v;}
export function eventFields(value:unknown,p:Project):EventFields{
  const b=object(value),startsAt=timestamp(b.startsAt),endsAt=b.endsAt==null?null:timestamp(b.endsAt);
  if(endsAt!==null&&endsAt<=startsAt)throw new InputError('End must follow start.');
  const artwork=string(b.artwork??'',2048,false);if(artwork&&!choices(p).includes(artwork))throw new InputError('Choose approved project artwork.');
  return {title:string(b.title,100),description:string(b.description,2000),access:string(b.access??'',300,false),startsAt,endsAt,artwork,typeId:string(b.typeId,60),destination:official(b.destination,p)};
}
async function types(db:D1Database){return (await db.prepare('SELECT * FROM calendar_types ORDER BY name').all<CalendarType>()).results.map(t=>({...t,archived:!!t.archived}));}
function projectEvent(row:Row,p:Project,privateView=false):CalendarEvent{
  const f:EventFields=JSON.parse((privateView?row.draft:row.published)!);
  return {...f,...(privateView&&row.source?{sourceUrl:JSON.parse(row.source)[0] as string}:{}),id:row.id,projectId:p.id,projectName:p.name,projectSlug:p.slug,categories:p.classification?[p.classification.primary,...p.classification.secondary]:[],
    artwork:choices(p).includes(f.artwork)?f.artwork:choices(p)[0]??'',status:privateView?row.status:row.status==='cancelled'?'cancelled':'published',
    revision:row.revision,featured:!!row.featured,hasPublished:!!row.published,updatedAt:privateView?row.updated_at:row.published_at!};
}
export async function publicEvent(db:D1Database,id:string){
  const row=await db.prepare('SELECT * FROM calendar_events WHERE id=? AND '+publicRows).bind(id).first<Row>();
  if(!row)throw new InputError('Event not found.',404);return projectEvent(row,await findPublicProject(db,row.project_id));
}
export async function discoveryEvents(db:D1Database,projects:Project[],reminderUser:string|null,now=Date.now()){
  if(!projects.length)return [];
  const names=new Map(projects.map(p=>[p.id,p.name]));
  const savedReminder=reminderUser?' AND EXISTS(SELECT 1 FROM calendar_members m WHERE m.event_id=calendar_events.id AND m.user_id=? AND m.reminder=1)':'';
  const values=[JSON.stringify([...names.keys()]),now,...(reminderUser?[reminderUser]:[])];
  const rows=await db.prepare(`SELECT id,project_id,json_extract(published,'$.title') title,json_extract(published,'$.startsAt') startsAt
    FROM calendar_events WHERE project_id IN(SELECT value FROM json_each(?)) AND ${publicRows}
    AND status<>'cancelled' AND json_extract(published,'$.startsAt')>=?${savedReminder}
    ORDER BY startsAt,id LIMIT 3`).bind(...values).all<{id:string;project_id:string;title:string;startsAt:number}>();
  return rows.results.filter(e=>!reminderUser||reminderDue({status:'published',startsAt:e.startsAt},now))
    .map(e=>({id:e.id,title:e.title,projectName:names.get(e.project_id)!,startsAt:e.startsAt}));
}
export async function agenda(db:D1Database){
  const [directory,rows,eventTypes]=await Promise.all([catalog(db),db.prepare('SELECT * FROM calendar_events WHERE '+publicRows+" ORDER BY json_extract(published,'$.startsAt'),id").all<Row>(),types(db)]);
  const projects=new Map(directory.projects.map(p=>[p.id,p]));
  return {events:rows.results.flatMap(r=>projects.has(r.project_id)?[projectEvent(r,projects.get(r.project_id)!)]:[]),types:eventTypes,categories:directory.categories,projects:directory.projects.map(({id,name})=>({id,name}))};
}
export async function management(db:D1Database,projectId:string,user:string){
  if(!await db.prepare('SELECT 1 WHERE '+authorizedOwner).bind(projectId,user).first())throw new InputError('Project manager access required.',403);
  const p=await findPublicProject(db,projectId), rows=await db.prepare('SELECT * FROM calendar_events WHERE project_id=? ORDER BY updated_at DESC').bind(projectId).all<Row>();
  return {events:rows.results.map(r=>projectEvent(r,p,true)),types:await types(db),artworkChoices:choices(p)};
}
export async function controlWorkspace(db:D1Database){
  const [{projects},eventTypes,rows,history,stats]=await Promise.all([catalog(db),types(db),db.prepare('SELECT * FROM calendar_events ORDER BY updated_at DESC').all<Row>(),
    db.prepare('SELECT event_id AS eventId,actor,action,reason,revision,created_at AS createdAt FROM calendar_history ORDER BY id DESC').all(),
    db.prepare("SELECT (SELECT COUNT(*) FROM calendar_events WHERE published IS NOT NULL AND status NOT IN ('cancelled','removed')) AS published,COUNT(*) AS saved,COALESCE(SUM(reminder),0) AS reminders FROM calendar_members").first()]);
  const map=new Map(projects.map(p=>[p.id,p]));return {events:rows.results.flatMap(r=>map.has(r.project_id)?[projectEvent(r,map.get(r.project_id)!,true)]:[]),types:eventTypes,history:history.results,stats,projects:projects.map(p=>({id:p.id,name:p.name,artworkChoices:choices(p)}))};
}
async function audited(db:D1Database,statement:D1PreparedStatement,id:string,user:string,action:string,reason:string,revision:number,snapshot:string,now:number){
  const result=await db.batch([statement,db.prepare('INSERT INTO calendar_history(event_id,actor,action,reason,revision,snapshot,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id,user,action,reason,revision,snapshot,now)]);
  if(result[0].meta.changes!==1)throw new InputError('The event, access or revision changed. Refresh and try again.',409);
  return {ok:true,id};
}
export async function changeEvent(db:D1Database,user:string,input:unknown,control:boolean){
  const b=object(input),action=string(b.action,16),reason=control?string(b.reason,500):'',now=Date.now(),rev=b.expectedRevision??0;
  if(typeof rev!=='number'||!Number.isSafeInteger(rev)||rev<0)throw new InputError('Invalid revision.');
  if(control&&action==='type'){
    const id=string(b.id,60),name=string(b.name,72);if(!/^[a-z][a-z0-9-]*$/.test(id)||typeof b.archived!=='boolean')throw new InputError('Invalid event type.');
    const stmt=rev===0?db.prepare('INSERT OR IGNORE INTO calendar_types(id,name,archived) VALUES(?,?,?)').bind(id,name,+b.archived):
      db.prepare('UPDATE calendar_types SET name=?,archived=?,revision=revision+1 WHERE id=? AND revision=?').bind(name,+b.archived,id,rev);
    return audited(db,stmt,id,user,action,reason,rev+1,JSON.stringify({name,archived:b.archived}),now);
  }
  if(!(control?['approve','reject','remove','feature','unfeature','suggest']:['draft','submit','cancel']).includes(action))throw new InputError('Unknown event action.');
  const id=b.id?string(b.id,100):crypto.randomUUID();
  const row=b.id?await db.prepare('SELECT * FROM calendar_events WHERE id=?').bind(id).first<Row>():null;
  if(b.id&&!row)throw new InputError('Event not found.',404);
  const projectId=string(b.projectId??row?.project_id,128);
  if(row&&(row.project_id!==projectId||row.revision!==rev))throw new InputError('Refresh to see the latest event.',409);
  const p=await findPublicProject(db,projectId);
  const guard=control?'1':authorizedOwner,args=control?[]:[projectId,user];
  const available='EXISTS(SELECT 1 FROM (SELECT ? AS candidate_project) WHERE '+publicProjectSql('candidate_project')+')';
  if(!control&&!await db.prepare('SELECT 1 WHERE '+guard).bind(...args).first())throw new InputError('Project manager access required.',403);
  const edit=['suggest','draft','submit'].includes(action);
  if(!row&&!edit||row&&action==='suggest'||row&&['removed','cancelled'].includes(row.status)&&action!=='remove')throw new InputError('Action unavailable.',409);
  const data=edit?eventFields(b.fields??(row?JSON.parse(row.draft):null),p):action==='approve'?eventFields(JSON.parse(row!.draft),p):JSON.parse(row!.draft) as EventFields;
  const draft=JSON.stringify(data),source=b.sourceUrl?JSON.stringify([official(b.sourceUrl,p),string(b.sourceKey??data.destination,2048)]):null;
  const typeGuard=edit||action==='approve'?'EXISTS(SELECT 1 FROM calendar_types WHERE id=? AND archived=0)':'1';
  const where=guard+' AND '+available+' AND '+typeGuard, params=[...args,projectId,...(typeGuard==='1'?[]:[data.typeId])];
  let status=action==='draft'?'draft':'pending',published=row?.published??null,publishedAt=row?.published_at??null,featured=row?.featured??0;
  if(action==='approve'||action==='reject'){
    if(row?.status!=='pending')throw new InputError('Only submitted events can be reviewed.',409);
    status=action==='approve'?'published':'rejected';if(action==='approve'){published=draft;publishedAt=now;}
  }else if(action==='cancel'||action==='remove'){status=action==='cancel'?'cancelled':'removed';publishedAt=now;featured=0;}
  else if(action==='feature'||action==='unfeature'){if(!published)throw new InputError('Approve the event first.',409);status=row!.status;featured=Number(action==='feature');}
  const stmt=row?db.prepare('UPDATE calendar_events SET draft=?,type_id=?,status=?,published=?,published_at=?,featured=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? AND '+where)
    .bind(draft,data.typeId,status,published,publishedAt,featured,now,id,rev,...params):
    db.prepare('INSERT OR IGNORE INTO calendar_events(id,project_id,type_id,draft,status,actor,source,created_at,updated_at,revision) SELECT ?,?,?,?,?,?,?,?,?,1 WHERE '+where+' AND (SELECT COUNT(*) FROM calendar_events WHERE actor=? AND created_at>=?)<30')
      .bind(id,projectId,data.typeId,draft,status,user,source,now,now,...params,user,now-86_400_000);
  return audited(db,stmt,id,user,action,reason,rev+1,draft,now);
}
export async function memberEvents(db:D1Database,user:string){
  return (await db.prepare('SELECT event_id AS id,reminder FROM calendar_members JOIN calendar_events ON id=event_id WHERE user_id=? AND '+publicRows).bind(user).all<{id:string;reminder:number}>()).results;
}
export async function saveEvent(db:D1Database,user:string,input:unknown){
  const b=object(input),id=string(b.id,100);
  if(typeof b.saved!=='boolean'||typeof b.reminder!=='boolean'||(!b.saved&&b.reminder))throw new InputError('Choose a valid reminder setting.');
  if(!b.saved){await db.prepare('DELETE FROM calendar_members WHERE user_id=? AND event_id=?').bind(user,id).run();return {ok:true};}
  const r=await db.prepare('INSERT INTO calendar_members(user_id,event_id,reminder) SELECT ?,id,? FROM calendar_events WHERE id=? AND '+publicRows+" AND status<>'cancelled' AND "+activeControlMemberSql('?')+' ON CONFLICT(user_id,event_id) DO UPDATE SET reminder=excluded.reminder').bind(user,+b.reminder,id,user).run();
  if(!r.meta.changes)throw new InputError('Event unavailable.',404);return {ok:true};
}
