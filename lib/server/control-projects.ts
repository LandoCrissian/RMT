import type {Project} from '@/lib/catalog';
import {getSeedProjects} from '@/lib/catalog';
import type {ControlProject,ControlProjectContent,ControlProjectsPage,ChangeControlProject,CreateControlProject,ChangeControlOwnership} from '@/lib/control-projects';
import {InputError,field,normalizeName,projectIdentityKey,validateProjectEdit,type ProjectEditInput} from '@/lib/submission-validation';
import {administrativeCatalog} from './repository';
import {auditInsert} from './control-audit';
import {activeControlMemberSql,controlObject,controlReason,controlRevision,type ControlActor} from './control-access';
import type {ProjectControlRow} from './control-visibility';
import {ARTWORK_ID_PATTERN} from '@/lib/project-artwork-validation';
import {assertControlArtworkSelection,controlArtworkSelectionGuard} from './control-artwork';

type OwnerRow={user_id:string;status:'active'|'revoked';revision:number};
const PAGE_SIZE=20;
export type ProjectListInput={q:string;visibility:'all'|'public'|'hidden'|'archived';category:string;page:number;pageSize:number};
const projectIdPattern=/^[a-zA-Z0-9_-]{1,120}$/;
export function checkedProjectId(id:string){if(!projectIdPattern.test(id))throw new InputError('Choose a valid project.');return id;}
function revisionGuard(id:string,revision:number,listingRevision:number){return{sql:'COALESCE((SELECT revision FROM project_controls WHERE project_id=?),0)=? AND COALESCE((SELECT revision FROM project_overrides WHERE project_id=?),0)=?',args:[id,revision,id,listingRevision]};}
function projectContent(project:Project,edit?:ProjectEditInput):ControlProjectContent{return{name:project.name,summary:project.description,category:project.category,stage:project.stage??'building',website:project.website,launchUrl:project.launchUrl,xProfile:edit?.xProfile??project.officialXProfile??'',links:edit?.links??project.links};}
async function projectRows(db:D1Database):Promise<ControlProject[]>{
 const [directory,owners]=await Promise.all([administrativeCatalog(db),db.prepare('SELECT project_id,user_id,status,revision FROM project_owners').all<OwnerRow&{project_id:string}>()]);
 const controls=new Map(directory.controls.map(row=>[row.project_id,row])),overrides=new Map(directory.overrides.map(row=>[row.project_id,row]));
 const sourceStatuses=new Map(directory.submissions.map(row=>[`community-${row.id}`,row.status]));
 const ownership=new Map(owners.results.map(row=>[row.project_id,row]));
 return directory.projects.map(project=>{
  const control=controls.get(project.id),published=overrides.get(project.id),owner=ownership.get(project.id);
  const origin=control?.source==='admin'?'admin':project.source==='community'?'community':'curated';
  const sourceStatus=origin==='community'?sourceStatuses.get(project.id)==='suspended'?'suspended':'approved':origin;
  const edit=control?.payload_json&&control.base_override_revision>=(published?.revision??0)?JSON.parse(control.payload_json) as ProjectEditInput:published?JSON.parse(published.payload_json) as ProjectEditInput:undefined;
  return{project,revision:control?.revision??0,listingRevision:published?.revision??0,visibility:control?.visibility??'public',featured:control?.featured===null||control?.featured===undefined?null:control.featured===1,
   artworkOverride:control?.artwork_override===1,logoAssetId:control?.logo_asset_id??null,bannerAssetId:control?.banner_asset_id??null,
   origin,sourceStatus,publiclyAvailable:(control?.visibility??'public')==='public'&&sourceStatus!=='suspended',content:projectContent(project,edit),
   owner:owner?{userId:owner.user_id,status:owner.status,revision:owner.revision}:null,updatedAt:control?.updated_at??null};
 });
}
export async function controlProjects(db:D1Database,input:ProjectListInput):Promise<ControlProjectsPage>{
 const query=input.q.toLowerCase();
 const projects=(await projectRows(db)).filter(item=>(input.visibility==='all'||item.visibility===input.visibility)&&(input.category==='all'||item.project.category===input.category)&&(!query||[item.project.name,item.project.id,item.project.description,item.owner?.userId??''].some(text=>text.toLowerCase().includes(query)))).sort((a,b)=>a.project.name.localeCompare(b.project.name)||a.project.id.localeCompare(b.project.id));
 const offset=(input.page-1)*input.pageSize;
 return{projects:projects.slice(offset,offset+input.pageSize),total:projects.length,page:input.page,pageSize:input.pageSize,hasMore:offset+input.pageSize<projects.length};
}
export async function controlProject(db:D1Database,id:string):Promise<ControlProject>{
 checkedProjectId(id);const item=(await projectRows(db)).find(item=>item.project.id===id);if(!item)throw new InputError('This project was not found.',404);return item;
}
export function validateControlProjectContent(value:unknown,id:string,baseRevision:number):{content:ControlProjectContent;edit:ProjectEditInput}{
 const input=controlObject(value,['name','summary','category','stage','website','launchUrl','xProfile','links']);
 const name=field(input,'name',2,80,'Project name');
 const edit=validateProjectEdit({projectId:id,baseRevision,summary:input.summary,category:input.category,stage:input.stage,website:input.website,launchUrl:input.launchUrl,xProfile:input.xProfile,links:input.links});
 if(!edit.launchUrl)throw new InputError('Add the project’s official website, X profile, or collection launch link.');
 return{content:{name,summary:edit.summary,category:edit.category,stage:edit.stage,website:edit.website,launchUrl:edit.launchUrl,xProfile:edit.xProfile,links:edit.links},edit};
}
export function validateCreateControlProject(value:unknown):CreateControlProject{
 const body=controlObject(value,['content','visibility','featured','reason','confirmedLinks']);
 if(!['public','hidden','archived'].includes(String(body.visibility))||typeof body.featured!=='boolean')throw new InputError('Choose the listing visibility and featured setting.');
 if(body.confirmedLinks!==true)throw new InputError('Confirm you checked the official links before adding this listing.');
 const {content}=validateControlProjectContent(body.content,'new-project',0);
 return{content,visibility:body.visibility as CreateControlProject['visibility'],featured:body.featured,reason:controlReason(body.reason),confirmedLinks:true};
}
export function validateChangeControlProject(value:unknown,id:string):ChangeControlProject{
 const body=controlObject(value,['action','expectedRevision','expectedListingRevision','reason','content','visibility','featured','confirmedLinks','logoAssetId','bannerAssetId']);
 const base={expectedRevision:controlRevision(body.expectedRevision),expectedListingRevision:controlRevision(body.expectedListingRevision),reason:controlReason(body.reason)};
 if(body.action==='edit'){
  if(body.confirmedLinks!==true)throw new InputError('Confirm you checked the official links before publishing this edit.');
  return{...base,action:'edit',content:validateControlProjectContent(body.content,id,base.expectedListingRevision).content,confirmedLinks:true};
 }
 if(body.action==='visibility'&&['public','hidden','archived'].includes(String(body.visibility)))return{...base,action:'visibility',visibility:body.visibility as 'public'|'hidden'|'archived'};
 if(body.action==='feature'&&(typeof body.featured==='boolean'||body.featured===null))return{...base,action:'feature',featured:body.featured};
 if(body.action==='reset_content')return{...base,action:'reset_content'};
 if(body.action==='reset_artwork')return{...base,action:'reset_artwork'};
 if(body.action==='artwork'){
  const asset=(value:unknown)=>{if(value===null)return null;if(typeof value==='string'&&ARTWORK_ID_PATTERN.test(value))return value;throw new InputError('Choose a valid image or use the original artwork.');};
  return{...base,action:'artwork',logoAssetId:asset(body.logoAssetId),bannerAssetId:asset(body.bannerAssetId)};
 }
 throw new InputError('Choose a supported project action.');
}
function normalizeIdentity(content:ControlProjectContent){return{name:normalizeName(content.name),host:projectIdentityKey(content.website||content.launchUrl,content.xProfile)};}
async function assertUniqueProject(db:D1Database,content:ControlProjectContent,except?:string){
 const normalized=normalizeIdentity(content);
 const items=await projectRows(db);
 if(items.some(item=>item.project.id!==except&&(normalizeName(item.project.name)===normalized.name||[item.project.website,item.project.launchUrl,...(item.project.collections??[]).map(v=>v.url)].filter(Boolean).some(url=>projectIdentityKey(url)===normalized.host))))throw new InputError('This project already has an RMT listing. Open its existing record instead.',409);
 const duplicate=await db.prepare("SELECT id FROM submissions WHERE status<>'rejected' AND (? IS NULL OR 'community-'||id<>?) AND (normalized_name=? OR normalized_host=?)").bind(except??null,except??null,normalized.name,normalized.host).first();
 if(duplicate)throw new InputError('This project already has an application or listing. Review that record instead.',409);
 return normalized;
}
function translateUnique(error:unknown):never{if(error instanceof Error&&/UNIQUE constraint failed.*project_controls/i.test(error.message))throw new InputError('This project already has an RMT listing. Refresh before adding it again.',409);throw error;}
export async function createControlProject(db:D1Database,actor:ControlActor,input:CreateControlProject):Promise<ControlProject>{
 const unique=await assertUniqueProject(db,input.content);
 const suffix=crypto.randomUUID(),id='admin-'+suffix,now=Date.now(),eventId=crypto.randomUUID();
 const {content,edit}=validateControlProjectContent(input.content,id,0);
 const project:Project={id,slug:'project-'+suffix,name:content.name,tagline:content.summary,description:content.summary,category:content.category,stage:content.stage,
  website:content.website,launchUrl:content.launchUrl,launchLabel:'Open project',links:[...(content.website?[{label:'Official website',url:content.website}]:[]),...(content.xProfile?[{label:'Official X',url:content.xProfile}]:[]),...content.links],
  initials:content.name.split(/\s+/).map(v=>v[0]).join('').slice(0,2).toUpperCase(),accent:'#c6ff42',cover:'community',claimed:false,source:'curated',...(input.visibility==='public'?{listedAt:new Date(now).toISOString()}:{})};
 const guard={sql:"NOT EXISTS(SELECT 1 FROM project_controls WHERE source='admin' AND (normalized_name=? OR normalized_host=?)) AND NOT EXISTS(SELECT 1 FROM submissions WHERE status<>'rejected' AND (normalized_name=? OR normalized_host=?)) AND (SELECT COUNT(*) FROM project_controls WHERE source='admin')<500",args:[unique.name,unique.host,unique.name,unique.host]};
 try{
  const results=await db.batch([
   auditInsert(db,actor,{id:eventId,action:'project.create',entityType:'project',entityId:id,reason:input.reason,after:{name:content.name,visibility:input.visibility,featured:input.featured},now},guard),
   db.prepare(`INSERT INTO project_controls(project_id,source,definition_json,name_override,payload_json,normalized_name,normalized_host,base_override_revision,visibility,featured,revision,created_at,updated_at)
    SELECT ?,'admin',?,'',?,?,?,0,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)`).bind(id,JSON.stringify(project),JSON.stringify(edit),unique.name,unique.host,input.visibility,Number(input.featured),now,now,eventId),
  ]);
  if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('The listing changed, already exists, or your access changed. Refresh before adding it again.',409);
 }catch(error){return translateUnique(error);}
 return controlProject(db,id);
}
export async function changeControlProject(db:D1Database,actor:ControlActor,id:string,input:ChangeControlProject):Promise<ControlProject>{
 const previous=await controlProject(db,id);
 if(previous.revision!==input.expectedRevision||previous.listingRevision!==input.expectedListingRevision)throw new InputError('This listing changed. Refresh it before saving.',409);
 const row=await db.prepare('SELECT * FROM project_controls WHERE project_id=?').bind(id).first<ProjectControlRow>();
 let name=row?.name_override??'',payload=row?.payload_json??null,base=row?.base_override_revision??0;
 let visibility=row?.visibility??'public',featured=row?.featured??null,normalizedName=row?.normalized_name??null,normalizedHost=row?.normalized_host??null;
 let logoAssetId=row?.logo_asset_id??null,bannerAssetId=row?.banner_asset_id??null,artworkOverride=row?.artwork_override??0;
 if(input.action==='edit'){
  const unique=await assertUniqueProject(db,input.content,id),validated=validateControlProjectContent(input.content,id,previous.listingRevision);
  name=validated.content.name;payload=JSON.stringify(validated.edit);base=previous.listingRevision;
  if(row?.source==='admin'){normalizedName=unique.name;normalizedHost=unique.host;}
 }else if(input.action==='visibility')visibility=input.visibility;
 else if(input.action==='feature')featured=input.featured===null?null:Number(input.featured);
 else if(input.action==='reset_content'){if(row?.source==='admin')throw new InputError('Admin-added projects have no earlier imported listing to restore. Edit the listing instead.');name='';payload=null;base=previous.listingRevision;}
 else if(input.action==='artwork'){await assertControlArtworkSelection(db,id,input.logoAssetId,input.bannerAssetId);logoAssetId=input.logoAssetId;bannerAssetId=input.bannerAssetId;artworkOverride=1;}
 else if(input.action==='reset_artwork'){logoAssetId=null;bannerAssetId=null;artworkOverride=0;}
 const now=Date.now(),eventId=crypto.randomUUID();
 let definition=row?.definition_json??null;
 if(row?.source==='admin'&&definition&&visibility==='public'){const baseProject=JSON.parse(definition) as Project;if(!baseProject.listedAt)definition=JSON.stringify({...baseProject,listedAt:new Date(now).toISOString()});}
 const revision=revisionGuard(id,input.expectedRevision,input.expectedListingRevision),selection=input.action==='artwork'?controlArtworkSelectionGuard(id,logoAssetId,bannerAssetId):{sql:'1=1',args:[]};
 const statements=[auditInsert(db,actor,{id:eventId,action:'project.'+input.action,entityType:'project',entityId:id,reason:input.reason,before:{visibility:previous.visibility,featured:previous.featured,name:previous.project.name,artworkOverride:previous.artworkOverride,logoAssetId:previous.logoAssetId,bannerAssetId:previous.bannerAssetId},after:{visibility,featured:featured===null?null:featured===1,name:name||previous.project.name,artworkOverride:artworkOverride===1,logoAssetId,bannerAssetId},now},{sql:`(${revision.sql}) AND (${selection.sql})`,args:[...revision.args,...selection.args]}),
  db.prepare(`INSERT INTO project_controls(project_id,source,definition_json,name_override,payload_json,normalized_name,normalized_host,logo_asset_id,banner_asset_id,artwork_override,base_override_revision,visibility,featured,revision,created_at,updated_at)
   SELECT ?, 'existing', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ? WHERE EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)
   ON CONFLICT(project_id) DO UPDATE SET definition_json=COALESCE(excluded.definition_json,project_controls.definition_json),name_override=excluded.name_override,payload_json=excluded.payload_json,normalized_name=excluded.normalized_name,normalized_host=excluded.normalized_host,
    logo_asset_id=excluded.logo_asset_id,banner_asset_id=excluded.banner_asset_id,artwork_override=excluded.artwork_override,
    base_override_revision=excluded.base_override_revision,visibility=excluded.visibility,featured=excluded.featured,revision=project_controls.revision+1,updated_at=excluded.updated_at WHERE project_controls.revision=?`)
   .bind(id,definition,name,payload,normalizedName,normalizedHost,logoAssetId,bannerAssetId,artworkOverride,base,visibility,featured,now,now,eventId,input.expectedRevision)];
 if(input.action==='edit'||input.action==='reset_content'){
  // Existing pending edits were composed against the prior public listing. Ask
  // their author to refresh instead of silently overwriting an admin edit later.
  const note='The site administrator changed this listing. Refresh the current project before submitting another edit.';
  statements.push(db.prepare(`INSERT INTO edit_review_events(id,edit_id,reviewer_id,previous_status,next_status,note,revision,created_at)
    SELECT lower(hex(randomblob(16))),id,?,'pending','rejected',?,revision+1,? FROM project_edits WHERE project_id=? AND status='pending' AND EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)`).bind(actor.userId,note,now,id,eventId));
  statements.push(db.prepare(`UPDATE project_edits SET status='rejected',review_note=?,revision=revision+1,updated_at=? WHERE project_id=? AND status='pending' AND EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)`).bind(note,now,id,eventId));
 }
 try{const result=await db.batch(statements);if(result[0]?.meta.changes!==1||result[1]?.meta.changes!==1)throw new InputError('This listing or your permissions changed. Refresh before saving.',409);}catch(error){return translateUnique(error);}
 return controlProject(db,id);
}
export function validateControlOwnership(value:unknown):ChangeControlOwnership{
 const body=controlObject(value,['action','expectedRevision','reason','targetUserId','confirmedOwnership']);
 const expectedRevision=controlRevision(body.expectedRevision),reason=controlReason(body.reason);
 if(body.action==='revoke')return{action:'revoke',expectedRevision,reason};
 if(body.action==='transfer'&&body.confirmedOwnership===true&&typeof body.targetUserId==='string'&&body.targetUserId.length>0&&body.targetUserId.length<=200&&!/[\u0000-\u001f\u007f]/.test(body.targetUserId))return{action:'transfer',expectedRevision,reason,targetUserId:body.targetUserId,confirmedOwnership:true};
 throw new InputError('Select the exact member and confirm their project ownership before transferring.');
}
export async function changeControlOwnership(db:D1Database,actor:ControlActor,id:string,input:ChangeControlOwnership):Promise<ControlProject>{
 const project=await controlProject(db,id),previous=project.owner;
 if((previous?.revision??0)!==input.expectedRevision)throw new InputError('Project ownership changed. Refresh before continuing.',409);
 if(input.action==='revoke'&&(!previous||previous.status!=='active'))throw new InputError('This project has no active owner to revoke.',409);
 if(input.action==='transfer'&&previous?.status==='active'&&previous.userId===input.targetUserId)throw new InputError('This member already manages this project.',409);
 const target=input.action==='transfer'?input.targetUserId!:previous!.userId;
 const known=input.action==='transfer'?await db.prepare("SELECT user_id FROM control_members WHERE user_id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM account_links al WHERE 'firebase:'||al.firebase_uid=control_members.user_id AND al.legacy_user_id<>control_members.user_id)").bind(target).first():true;
 if(!known)throw new InputError('Select an active member from the registered member directory.',404);
 const now=Date.now(),eventId=crypto.randomUUID(),status=input.action==='transfer'?'active':'revoked';
 const guard={sql:`COALESCE((SELECT revision FROM project_owners WHERE project_id=?),0)=?${input.action==='transfer'?" AND EXISTS(SELECT 1 FROM control_members WHERE user_id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM account_links al WHERE 'firebase:'||al.firebase_uid=control_members.user_id AND al.legacy_user_id<>control_members.user_id))":''}`,args:[id,input.expectedRevision,...(input.action==='transfer'?[target]:[])]};
 const results=await db.batch([
  auditInsert(db,actor,{id:eventId,action:'ownership.'+input.action,entityType:'project',entityId:id,reason:input.reason,before:{userId:previous?.userId??null,status:previous?.status??null},after:{userId:target,status},now},guard),
  db.prepare(`INSERT INTO project_owners(project_id,user_id,claim_id,status,revision,created_at,updated_at)
    SELECT ?,?,NULL,?,1,?,? WHERE EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)
    ON CONFLICT(project_id) DO UPDATE SET user_id=excluded.user_id,claim_id=NULL,status=excluded.status,revision=project_owners.revision+1,updated_at=excluded.updated_at WHERE project_owners.revision=?`).bind(id,target,status,now,now,eventId,input.expectedRevision),
  db.prepare(`INSERT INTO claim_review_events(id,claim_id,reviewer_id,previous_status,next_status,note,revision,created_at)
    SELECT lower(hex(randomblob(16))),id,?,status,'revoked',?,revision+1,? FROM project_claims WHERE project_id=? AND status='approved' AND EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)`).bind(actor.userId,input.reason,now,id,eventId),
  db.prepare(`UPDATE project_claims SET status='revoked',review_note=?,revision=revision+1,updated_at=? WHERE project_id=? AND status='approved' AND EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)`).bind(input.reason,now,id,eventId),
 ]);
 if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('Ownership, member status, or your permissions changed. Refresh before continuing.',409);
 return controlProject(db,id);
}
export function projectListInput(search:URLSearchParams):ProjectListInput{
 const q=(search.get('q')??'').trim();if(q.length>100)throw new InputError('Search with 100 characters or fewer.');
 const visibility=search.get('visibility')??'all',category=search.get('category')??'all';
 if(!['all','public','hidden','archived'].includes(visibility)||!['all','Games','Music','Tools','Community'].includes(category))throw new InputError('Choose valid project filters.');
 const page=Number(search.get('page')??1),pageSize=Number(search.get('pageSize')??PAGE_SIZE);
 if(!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)throw new InputError('Choose a valid project page.');
 return{q,visibility:visibility as ProjectListInput['visibility'],category,page,pageSize};
}
