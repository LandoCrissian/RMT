import {InputError} from '@/lib/submission-validation';
import {legacyPrimary} from '@/lib/taxonomy';
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
type Option = {id:string;name:string};
export function interestId(value:string){
  return Object.hasOwn(legacyPrimary,value)?legacyPrimary[value as keyof typeof legacyPrimary]:value;
}
async function activeOptions(db:D1Database){
  return (await db.prepare('SELECT id,name FROM taxonomy_categories WHERE archived=0 ORDER BY position,id').all<Option>()).results;
}
function parseConfig(value:unknown,options:Option[],stored=false):DiscoveryConfig {
  const input=controlObject(value,['categories','lessons','recommendedIds']);
  const normalized=list(input.categories,stored?Infinity:options.length).map(interestId);
  const selected=new Set(normalized);
  const enabled=options.filter(option=>selected.has(option.id)).map(option=>option.id);
  if(!stored&&normalized.length!==enabled.length)throw new InputError('Choose a supported project interest.');
  if(!Array.isArray(input.lessons)||input.lessons.length<1||input.lessons.length>10)throw new InputError('Include between one and ten guide lessons.');
  const lessons=input.lessons.map(item=>{
    const lesson=controlObject(item,['title','body']);
    return {title:plainText(lesson.title,90),body:plainText(lesson.body,1000)};
  });
  return {categories:enabled,lessons,recommendedIds:list(input.recommendedIds,12)};
}
async function versionedConfig(db:D1Database,options:Option[]):Promise<Versioned> {
  const row=await db.prepare("SELECT payload_json,revision FROM discovery_config WHERE id='discovery'").first<{payload_json:string;revision:number}>();
  if(row)return {...parseConfig(JSON.parse(row.payload_json),options,true),revision:row.revision};
  return {categories:options.map(c=>c.id),lessons:structuredClone(defaultLessons),recommendedIds:[],revision:0};
}
export async function getDiscoveryConfig(db:D1Database) {
  const options=await activeOptions(db);
  const {revision,...config}=await versionedConfig(db,options);
  return {...config,categoryLabels:Object.fromEntries(options.filter(c=>config.categories.includes(c.id)).map(c=>[c.id,c.name]))};
}
export async function discoveryWorkspace(db:D1Database){
  const options=await activeOptions(db);
  const [config,listing,stats]=await Promise.all([versionedConfig(db,options),catalog(db),db.prepare(
    "SELECT COUNT(CASE WHEN onboarding='completed' THEN 1 END) AS completed, COUNT(CASE WHEN onboarding='skipped' THEN 1 END) AS skipped,(SELECT COUNT(*) FROM discovery_reads) AS reads FROM discovery_members"
  ).first<{completed:number;skipped:number;reads:number}>()]);
  if(!stats)throw new Error('Unable to retrieve discovery statistics');
  return {config,options,projects:listing.projects.map(p=>({id:p.id,name:p.name})),stats};
}
export async function changeDiscoveryConfig(db:D1Database,actor:ControlActor,value:unknown) {
  if(!actor.capabilities.includes('settings'))throw new InputError('Discovery settings require administrator access.',403);
  const input=controlObject(value,['expectedRevision','reason','categories','recommendedIds','lessons']);
  const {expectedRevision,reason,...fields}=input;
  const options=await activeOptions(db);
  const expected=controlRevision(expectedRevision),note=controlReason(reason),next=parseConfig(fields,options);
  const before=await versionedConfig(db,options);
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
