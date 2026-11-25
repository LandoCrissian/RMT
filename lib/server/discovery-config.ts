import {categories, InputError} from '@/lib/submission-validation';
import {defaultLessons} from '@/lib/discovery-defaults';
import {controlActorGuard,controlObject,controlReason,controlRevision,type ControlActor} from './control-access';
import {auditInsert} from './control-audit';
import {catalog} from './repository';

export type DiscoveryConfig = {
  categories:string[];
  lessons:{title:string;body:string}[];
  recommendedIds:string[];
};
type Versioned = DiscoveryConfig & {revision:number};

function plainText(value:unknown,max:number) {
  if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f\u007f]/u.test(value.trim()))
    throw new InputError('Enter a short plain-text title and explanation for each lesson.');
  return value.trim();
}
function list(value:unknown,max:number) {
  if(!Array.isArray(value)||value.length>max||value.some(item=>typeof item!=='string')||new Set(value).size!==value.length)
    throw new InputError('Choose unique entries from the available options.');
  return value as string[];
}
function parseConfig(value:unknown):DiscoveryConfig {
  const input=controlObject(value,['categories','lessons','recommendedIds']);
  const enabled=list(input.categories,categories.length);
  if(!enabled.every(category=>categories.some(choice=>choice===category)))throw new InputError('Choose a supported project interest.');
  if(!Array.isArray(input.lessons)||input.lessons.length<1||input.lessons.length>10)throw new InputError('Include between one and ten guide lessons.');
  const lessons=input.lessons.map(item=>{
    const lesson=controlObject(item,['title','body']);
    return {title:plainText(lesson.title,90),body:plainText(lesson.body,1000)};
  });
  return {categories:enabled,lessons,recommendedIds:list(input.recommendedIds,12)};
}
async function versionedConfig(db:D1Database):Promise<Versioned> {
  const row=await db.prepare("SELECT payload_json,revision FROM discovery_config WHERE id='discovery'").first<{payload_json:string;revision:number}>();
  if(row)return {...parseConfig(JSON.parse(row.payload_json)),revision:row.revision};
  return {categories:[...categories],lessons:structuredClone(defaultLessons),recommendedIds:[],revision:0};
}
export async function getDiscoveryConfig(db:D1Database):Promise<DiscoveryConfig> {
  const {revision,...config}=await versionedConfig(db);
  return config;
}
export async function discoveryWorkspace(db:D1Database){
  const [config,listing,stats]=await Promise.all([versionedConfig(db),catalog(db),db.prepare(
    "SELECT COUNT(CASE WHEN onboarding='completed' THEN 1 END) AS completed, COUNT(CASE WHEN onboarding='skipped' THEN 1 END) AS skipped,(SELECT COUNT(*) FROM discovery_reads) AS reads FROM discovery_members"
  ).first<{completed:number;skipped:number;reads:number}>()]);
  if(!stats)throw new Error('Unable to retrieve discovery statistics');
  return {config,projects:listing.projects.map(p=>({id:p.id,name:p.name})),stats};
}
export async function changeDiscoveryConfig(db:D1Database,actor:ControlActor,value:unknown) {
  if(!actor.capabilities.includes('settings'))throw new InputError('Discovery settings require administrator access.',403);
  const input=controlObject(value,['expectedRevision','reason','categories','recommendedIds','lessons']);
  const {expectedRevision,reason,...fields}=input;
  const expected=controlRevision(expectedRevision),note=controlReason(reason),next=parseConfig(fields);
  const before=await versionedConfig(db);
  if(expected!==before.revision)throw new InputError('Discovery settings changed. Reload before saving.',409);
  if(next.recommendedIds.length){
    const available=new Set((await catalog(db)).projects.map(p=>p.id));
    if(next.recommendedIds.some(id=>!available.has(id)))throw new InputError('Recommendations must be public projects.');
  }
  const role=controlActorGuard(actor);
  const guard={sql:"("+role.sql+") AND COALESCE((SELECT revision FROM discovery_config WHERE id='discovery'),0)=?",args:[...role.args,expected]};
  const result=await db.batch([
    auditInsert(db,actor,{action:'discovery.update',entityId:'discovery',entityType:'settings',reason:note,before,after:next},guard),
    db.prepare("INSERT INTO discovery_config(id,payload_json,revision) SELECT 'discovery',?,? WHERE "+guard.sql+
      " ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json,revision=excluded.revision").bind(JSON.stringify(next),expected+1,...guard.args)
  ]);
  if(result.some(entry=>entry.meta.changes!==1))throw new InputError('Discovery settings or your permissions changed. Reload before saving.',409);
  return {...next,revision:expected+1};
}
