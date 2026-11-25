import type {ControlProject, ControlProjectsPage, ControlContentItem, ControlContentPage,ControlProjectArtwork} from '../control-projects';
import type {Project} from '../catalog';

export type ControlRole = 'owner' | 'admin' | 'moderator' | 'member';
export type ControlCapability = 'overview' | 'review' | 'projects' | 'content' | 'members' | 'audit' | 'health' | 'exports' | 'settings' | 'roles';
export type ControlOverview = {role:ControlRole; capabilities:ControlCapability[]; metrics:Record<'members'|'observedMembers'|'activeLast7Days'|'listedProjects'|'confirmedBuilders'|'pendingSubmissions'|'pendingClaims'|'pendingEdits'|'pendingUpdates'|'suspendedMembers'|'publicProfiles',number>;observedSince:number|null;generatedAt:number};
export type ControlMember = {id:string;displayName:string;email:string;providers:string[];emailVerified:boolean|null;firstSeenAt:number|null;lastSeenAt:number|null;historicalSinceAt:number|null;status:'active'|'suspended';statusReason:string;revision:number;role:ControlRole;roleRevision:number;protectedOwner:boolean;profile:{handle:string|null;displayName:string;visibility:'private'|'public'}|null;projectCount:number;submissionCount:number};
export type ControlMembersPage = {items:ControlMember[];nextCursor:string|null;hasMore:boolean;observedSince:number|null};
export type ControlAuditItem = {id:string;actorId:string;action:string;entityType:string;entityId:string;reason:string;createdAt:number};
export type ControlAuditPage = {items:ControlAuditItem[];nextCursor:string|null;hasMore:boolean};
export type ControlMemberDetail = {member:ControlMember;projects:{id:string;name:string;status:string}[];recentAudit:ControlAuditItem[]};
import {homepageArtwork} from "../homepage-art";
export type ControlSettings = {homepageArtwork:string;revision:number;notice:{enabled:boolean;text:string;linkLabel:string;linkUrl:string};maintenance:{enabled:boolean;message:string};submissionsOpen:boolean;claimsOpen:boolean;updatesOpen:boolean;updatedAt:number|null};
export type ControlAnalytics = {days:number;startedAt:number|null;visits:number;projectViews:number;outboundClicks:number;daily:{day:string;visits:number;projectViews:number;outboundClicks:number}[];projects:{projectId:string;name:string;views:number;clicks:number}[];note:string};
export type ControlHealth = {checks:{id:string;label:string;status:'ok'|'warning'|'error'|'unknown';detail:string}[];generatedAt:number;storage:{imageCount:number;imageBytes:number};exports:{datasets:string[];formats:string[];pageLimit:number;fullBackup:boolean}};
export type ControlExport = {schemaVersion:number;exportedAt:number;dataset:string;items:Record<string,unknown>[];nextCursor:string|null;hasMore:boolean};
export type ControlCsvExport = {csv:string;nextCursor:string|null;hasMore:boolean};

export class ControlRequestError extends Error {
  constructor(message:string, public needsRefresh=false, public accountChanged=false) {super(message);this.name='ControlRequestError';}
}
export const controlCapabilities:ControlCapability[]=['overview','review','projects','content','members','audit','health','exports','settings','roles'];
const roles:ControlRole[]=['owner','admin','moderator','member'];
function invalid():never {throw new ControlRequestError('RMT returned an incomplete response. Reload this section before making changes.');}
export function controlObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=2000):string {if(typeof value!=='string'||value.length>max)return invalid();return value;}
function number(value:unknown):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)return invalid();return value;}
function nullableNumber(value:unknown):number|null{return value===null?null:number(value);}
function boolean(value:unknown):boolean{if(typeof value!=='boolean')return invalid();return value;}
function list<T>(value:unknown,parse:(value:unknown)=>T,max=500):T[]{if(!Array.isArray(value)||value.length>max)return invalid();return value.map(parse);}
function choice<T extends string>(value:unknown,values:readonly T[]):T {if(typeof value!=='string'||!values.includes(value as T))return invalid();return value as T;}
function cursor(value:unknown):string|null {return value===null?null:text(value,4096);}
function page<T>(value:Record<string,unknown>,parse:(value:unknown)=>T){const items=list(value.items,parse);const nextCursor=cursor(value.nextCursor),hasMore=boolean(value.hasMore);if(hasMore!==Boolean(nextCursor))return invalid();return {items,nextCursor,hasMore};}

export async function controlResponseData(response:Response,mutation=false):Promise<Record<string,unknown>> {
  const denied=response.status===401||response.status===403;
  let raw:unknown;try{raw=await response.json();}catch{throw new ControlRequestError(denied?'Your account or administrator access changed. Refresh RMT to continue.':mutation?'We could not confirm the change. Reload the saved version before trying again.':'RMT could not load this section. Please try again.',mutation&&!denied,denied);}
  const data=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
  if(!response.ok){const changed=denied||data?.code==='account_changed';const message=typeof data?.error==='string'?data.error:'RMT could not complete this request.';throw new ControlRequestError(message,!changed&&(response.status===409||(mutation&&response.status>=500)),changed);}
  if(!data)throw new ControlRequestError('RMT returned an incomplete response. Reload the saved version.',mutation);
  return data;
}
export function overviewResponse(value:unknown):ControlOverview {
  const row=controlObject(value),metrics=controlObject(row.metrics);const keys=['members','observedMembers','activeLast7Days','listedProjects','confirmedBuilders','pendingSubmissions','pendingClaims','pendingEdits','pendingUpdates','suspendedMembers','publicProfiles'] as const;
  return {role:choice(row.role,roles),capabilities:list(row.capabilities,x=>choice(x,controlCapabilities),20),metrics:Object.fromEntries(keys.map(key=>[key,number(metrics[key])])) as ControlOverview['metrics'],observedSince:nullableNumber(row.observedSince),generatedAt:number(row.generatedAt)};
}
export function controlMember(value:unknown):ControlMember {
  const row=controlObject(value),profile=row.profile===null?null:controlObject(row.profile);
  return {id:text(row.id,250),displayName:text(row.displayName,150),email:text(row.email,254),providers:list(row.providers,x=>text(x,100),10),emailVerified:row.emailVerified===null?null:boolean(row.emailVerified),firstSeenAt:nullableNumber(row.firstSeenAt),lastSeenAt:nullableNumber(row.lastSeenAt),historicalSinceAt:nullableNumber(row.historicalSinceAt),status:choice(row.status,['active','suspended']),statusReason:text(row.statusReason,1000),revision:number(row.revision),role:choice(row.role,roles),roleRevision:number(row.roleRevision),protectedOwner:boolean(row.protectedOwner),profile:profile?{handle:profile.handle===null?null:text(profile.handle,24),displayName:text(profile.displayName,100),visibility:choice(profile.visibility,['private','public'])}:null,projectCount:number(row.projectCount),submissionCount:number(row.submissionCount)};
}
export function memberResponse(value:unknown):ControlMember{return controlMember(controlObject(value).member);}
export function membersResponse(value:unknown):ControlMembersPage{const row=controlObject(value);return {...page(row,controlMember),observedSince:nullableNumber(row.observedSince)};}
function auditItem(value:unknown):ControlAuditItem{const row=controlObject(value);return{id:text(row.id,300),actorId:text(row.actorId,250),action:text(row.action,150),entityType:text(row.entityType,80),entityId:text(row.entityId,300),reason:text(row.reason,2000),createdAt:number(row.createdAt)};}
export function auditResponse(value:unknown):ControlAuditPage{return page(controlObject(value),auditItem);}
export function memberDetailResponse(value:unknown):ControlMemberDetail{const row=controlObject(value);return{member:controlMember(row.member),projects:list(row.projects,value=>{const p=controlObject(value);return{id:text(p.id,200),name:text(p.name,100),status:text(p.status,60)};}),recentAudit:list(row.recentAudit,auditItem)};}

export function safeControlLink(value:unknown):string|null {
  if(typeof value!=='string'||value.length>4096)return null;
  if(/^\/u\/[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(value)||/^\/projects\/[a-zA-Z0-9_-]+(?:#updates)?$/.test(value))return value;
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function safeControlImage(value:unknown):string|null {return typeof value==='string'&&/^\/(?:projects\/[a-zA-Z0-9._/-]+|media\/(?:project-artwork|control-project-artwork)\/[a-f0-9-]{36})$/.test(value)&&!value.includes('..')?value:null;}
function project(value:unknown):Project {
  const row=controlObject(value);
  if(typeof row.name!=='string'||typeof row.id!=='string'||typeof row.slug!=='string'||!['Games','Music','Tools','Community'].includes(String(row.category))||!Array.isArray(row.links))return invalid();
  // Project records stay private to this screen; render text as text and only the safe local image path.
  return {...row,id:text(row.id,200),slug:text(row.slug,200),name:text(row.name,100),tagline:text(row.tagline,500),description:text(row.description,8000),cover:text(row.cover,2048),initials:text(row.initials,8),accent:text(row.accent,40)} as Project;
}
export function controlProject(value:unknown):ControlProject {
  const row=controlObject(value),content=controlObject(row.content),owner=row.owner===null?null:controlObject(row.owner);
  return {project:project(row.project),revision:number(row.revision),listingRevision:number(row.listingRevision),visibility:choice(row.visibility,['public','hidden','archived']),featured:row.featured===null?null:boolean(row.featured),origin:choice(row.origin,['curated','community','admin']),sourceStatus:choice(row.sourceStatus,['curated','approved','suspended','admin']),publiclyAvailable:boolean(row.publiclyAvailable),artworkOverride:boolean(row.artworkOverride),logoAssetId:row.logoAssetId===null?null:artworkId(row.logoAssetId),bannerAssetId:row.bannerAssetId===null?null:artworkId(row.bannerAssetId),updatedAt:nullableNumber(row.updatedAt),owner:owner?{userId:text(owner.userId,250),status:choice(owner.status,['active','revoked']),revision:number(owner.revision)}:null,content:{name:text(content.name,80),summary:text(content.summary,280),category:choice(content.category,['Games','Music','Tools','Community']),stage:choice(content.stage,['starting','building','beta','live']),website:text(content.website,2048),launchUrl:text(content.launchUrl,2048),xProfile:text(content.xProfile,2048),links:list(content.links,value=>{const link=controlObject(value);return{label:text(link.label,100),url:text(link.url,2048),...(typeof link.type==='string'?{type:link.type}:{})};},12)}};
}
export function controlProjectResponse(value:unknown):ControlProject{return controlProject(controlObject(value).project);}
export function projectsResponse(value:unknown):ControlProjectsPage{const row=controlObject(value);return{projects:list(row.projects,controlProject,50),total:number(row.total),page:number(row.page),pageSize:number(row.pageSize),hasMore:boolean(row.hasMore)};}
function controlContent(value:unknown):ControlContentItem{const row=controlObject(value);return{kind:choice(row.kind,['profile','update']),id:text(row.id,250),title:text(row.title,300),body:text(row.body,10000),userId:text(row.userId,250),projectId:row.projectId===null?null:text(row.projectId,250),projectName:row.projectName===null?null:text(row.projectName,100),publicUrl:row.publicUrl===null?null:safeControlLink(row.publicUrl),hidden:boolean(row.hidden),reason:text(row.reason,1000),revision:number(row.revision),contentRevision:number(row.contentRevision),updatedAt:number(row.updatedAt),sourceStatus:text(row.sourceStatus,80)};}
export function contentResponse(value:unknown):ControlContentPage{const row=controlObject(value);return{items:list(row.items,controlContent,50),total:number(row.total),page:number(row.page),pageSize:number(row.pageSize),hasMore:boolean(row.hasMore)};}
export function contentItemResponse(value:unknown):ControlContentItem{return controlContent(controlObject(value).item);}
export function settingsResponse(value:unknown):ControlSettings{const row=controlObject(controlObject(value).settings),notice=controlObject(row.notice),maintenance=controlObject(row.maintenance);return{homepageArtwork:homepageArtwork(row.homepageArtwork),revision:number(row.revision),notice:{enabled:boolean(notice.enabled),text:text(notice.text,1000),linkLabel:text(notice.linkLabel,100),linkUrl:text(notice.linkUrl,2048)},maintenance:{enabled:boolean(maintenance.enabled),message:text(maintenance.message,1000)},submissionsOpen:boolean(row.submissionsOpen),claimsOpen:boolean(row.claimsOpen),updatesOpen:boolean(row.updatesOpen),updatedAt:nullableNumber(row.updatedAt)};}
export function analyticsResponse(value:unknown):ControlAnalytics{const row=controlObject(controlObject(value).analytics);return{days:number(row.days),startedAt:nullableNumber(row.startedAt),visits:number(row.visits),projectViews:number(row.projectViews),outboundClicks:number(row.outboundClicks),daily:list(row.daily,value=>{const d=controlObject(value);return{day:text(d.day,30),visits:number(d.visits),projectViews:number(d.projectViews),outboundClicks:number(d.outboundClicks)};},31),projects:list(row.projects,value=>{const p=controlObject(value);return{projectId:text(p.projectId,200),name:text(p.name,100),views:number(p.views),clicks:number(p.clicks)};},100),note:text(row.note,2000)};}
export function healthResponse(value:unknown):ControlHealth{const row=controlObject(value),storage=controlObject(row.storage),exports=controlObject(row.exports);return{checks:list(row.checks,value=>{const c=controlObject(value);return{id:text(c.id,100),label:text(c.label,100),status:choice(c.status,['ok','warning','error','unknown']),detail:text(c.detail,2000)};},30),generatedAt:number(row.generatedAt),storage:{imageCount:number(storage.imageCount),imageBytes:number(storage.imageBytes)},exports:{datasets:list(exports.datasets,x=>text(x,100),20),formats:list(exports.formats,x=>text(x,20),5),pageLimit:number(exports.pageLimit),fullBackup:boolean(exports.fullBackup)}};}
export function exportResponse(value:unknown):ControlExport{const row=controlObject(value);return{schemaVersion:number(row.schemaVersion),exportedAt:number(row.exportedAt),dataset:text(row.dataset,100),...page(row,value=>controlObject(value))};}
export function csvExportResponse(value:unknown):ControlCsvExport{const row=controlObject(value),nextCursor=cursor(row.nextCursor),hasMore=boolean(row.hasMore);if(hasMore!==Boolean(nextCursor))return invalid();return{csv:text(row.csv,4_000_000),nextCursor,hasMore};}

function artworkId(value:unknown):string{const id=text(value,36);if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))return invalid();return id;}
export function controlArtwork(value:unknown):ControlProjectArtwork{const row=controlObject(value),id=artworkId(row.id);if(row.previewUrl!=='/api/control/artwork/'+id)return invalid();const width=number(row.width),height=number(row.height),byteSize=number(row.byteSize);if(!width||!height||byteSize<1||byteSize>2*1024*1024)return invalid();return{id,kind:choice(row.kind,['logo','banner']),width,height,mime:choice(row.mime,['image/png']),byteSize,previewUrl:row.previewUrl,createdAt:number(row.createdAt)};}
export function artworkListResponse(value:unknown):ControlProjectArtwork[]{return list(controlObject(value).artwork,controlArtwork,100);}
export function artworkResponse(value:unknown):ControlProjectArtwork{return controlArtwork(controlObject(value).artwork);}
export function artworkBlobResponse(value:unknown):Blob{if(!(value instanceof Blob)||value.type!=='image/png'||value.size<1||value.size>2*1024*1024)return invalid();return value;}
