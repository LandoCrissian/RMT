import type {ControlContentItem,ControlContentPage,ChangeControlContent,ControlContentKind} from '@/lib/control-projects';
import {InputError} from '@/lib/submission-validation';
import {controlObject,controlReason,controlRevision,type ControlActor} from './control-access';
import {auditInsert} from './control-audit';
import {administrativeCatalog} from './repository';

type ContentRow={kind:ControlContentKind;id:string;title:string;body:string;user_id:string;project_id:string|null;project_name:string|null;handle:string|null;
 hidden:number;reason:string;revision:number;content_revision:number;updated_at:number;source_status:string};
const profileSql=`SELECT 'profile' AS kind,p.user_id AS id,CASE WHEN p.visibility='public' THEN p.display_name ELSE 'Private member profile' END AS title,
 CASE WHEN p.visibility='public' THEN p.bio ELSE '' END AS body,p.user_id,NULL AS project_id,NULL AS project_name,CASE WHEN p.visibility='public' THEN p.handle ELSE NULL END AS handle,
 COALESCE(c.hidden,0) AS hidden,COALESCE(c.reason,'') AS reason,COALESCE(c.revision,0) AS revision,p.revision AS content_revision,MAX(p.updated_at,COALESCE(c.updated_at,0)) AS updated_at,p.visibility AS source_status
 FROM profiles p LEFT JOIN control_content c ON c.entity_type='profile' AND c.entity_id=p.user_id WHERE p.visibility='public' OR c.hidden=1`;
const updateSql=`SELECT 'update' AS kind,u.id,u.title,u.body,u.user_id,u.project_id,u.project_name,NULL AS handle,
 COALESCE(c.hidden,0) AS hidden,COALESCE(c.reason,'') AS reason,COALESCE(c.revision,0) AS revision,u.revision AS content_revision,MAX(u.updated_at,COALESCE(c.updated_at,0)) AS updated_at,u.status AS source_status
 FROM project_updates u LEFT JOIN control_content c ON c.entity_type='update' AND c.entity_id=u.id WHERE u.status IN ('approved','archived') AND u.published_at IS NOT NULL`;
export type ContentListInput={kind:'all'|ControlContentKind;visibility:'all'|'visible'|'hidden';q:string;page:number;pageSize:number};
function dto(row:ContentRow,slugs:Map<string,string>):ControlContentItem{
 let publicUrl:string|null=null;
 if(row.kind==='profile'&&row.handle&&/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]$/.test(row.handle))publicUrl='/u/'+encodeURIComponent(row.handle);
 if(row.kind==='update'&&row.project_id&&slugs.has(row.project_id))publicUrl='/projects/'+encodeURIComponent(slugs.get(row.project_id)!)+'#updates';
 return{kind:row.kind,id:row.id,title:row.title,body:row.body,userId:row.user_id,projectId:row.project_id,projectName:row.project_name,publicUrl,
 hidden:row.hidden===1,reason:row.reason,revision:row.revision,contentRevision:row.content_revision,updatedAt:row.updated_at,sourceStatus:row.source_status};
}
function query(input:ContentListInput){
 const source=input.kind==='profile'?profileSql:input.kind==='update'?updateSql:`${profileSql} UNION ALL ${updateSql}`;
 const where:string[]=[],args:(string|number)[]=[];
 if(input.visibility!=='all'){where.push('hidden=?');args.push(input.visibility==='hidden'?1:0);}
 if(input.q){where.push("(instr(lower(title),?)>0 OR instr(lower(COALESCE(project_name,'')),?)>0 OR instr(lower(id),?)>0)");args.push(...Array(3).fill(input.q.toLowerCase()));}
 return{sql:`WITH content AS (${source}) SELECT * FROM content${where.length?' WHERE '+where.join(' AND '):''}`,args};
}
export async function controlContent(db:D1Database,input:ContentListInput):Promise<ControlContentPage>{
 const {sql,args}=query(input),offset=(input.page-1)*input.pageSize;
 const [rows,count,directory]=await Promise.all([
  db.prepare(`${sql} ORDER BY updated_at DESC,kind,id LIMIT ? OFFSET ?`).bind(...args,input.pageSize,offset).all<ContentRow>(),
  db.prepare(`SELECT COUNT(*) AS count FROM (${sql})`).bind(...args).first<{count:number}>(),administrativeCatalog(db),
 ]);
 const slugs=new Map(directory.projects.map(p=>[p.id,p.slug])),total=Number(count?.count??0);
 return{items:rows.results.map(row=>dto(row,slugs)),total,page:input.page,pageSize:input.pageSize,hasMore:offset+input.pageSize<total};
}
async function contentItem(db:D1Database,kind:ControlContentKind,id:string):Promise<ControlContentItem>{
 const source=kind==='profile'?profileSql:updateSql;
 const row=await db.prepare(`SELECT * FROM (${source}) WHERE id=?`).bind(id).first<ContentRow>();
 if(!row)throw new InputError('This published content is no longer available for moderation.',404);
 const directory=await administrativeCatalog(db);return dto(row,new Map(directory.projects.map(p=>[p.id,p.slug])));
}
export function validateControlContent(value:unknown):ChangeControlContent{
 const body=controlObject(value,['kind','expectedRevision','expectedContentRevision','hidden','reason']);
 if(!['profile','update'].includes(String(body.kind))||typeof body.hidden!=='boolean')throw new InputError('Choose a valid content moderation action.');
 return{kind:body.kind as ControlContentKind,expectedRevision:controlRevision(body.expectedRevision),expectedContentRevision:controlRevision(body.expectedContentRevision),hidden:body.hidden,reason:controlReason(body.reason)};
}
export async function changeControlContent(db:D1Database,actor:ControlActor,id:string,input:ChangeControlContent):Promise<ControlContentItem>{
 if(!id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))throw new InputError('Choose a valid published item.');
 const previous=await contentItem(db,input.kind,id);
 if(previous.revision!==input.expectedRevision||previous.contentRevision!==input.expectedContentRevision)throw new InputError('This content changed. Refresh it before reviewing.',409);
 if(previous.hidden===input.hidden)throw new InputError('This moderation setting is already applied. Refresh the list.',409);
 const source=input.kind==='profile'?"EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND revision=? AND (visibility='public' OR ?=0))":"EXISTS(SELECT 1 FROM project_updates WHERE id=? AND revision=? AND status IN ('approved','archived') AND published_at IS NOT NULL)";
 const guard={sql:`COALESCE((SELECT revision FROM control_content WHERE entity_type=? AND entity_id=?),0)=? AND ${source}`,
  args:[input.kind,id,input.expectedRevision,id,input.expectedContentRevision,...(input.kind==='profile'?[Number(input.hidden)]:[])]};
 const now=Date.now(),eventId=crypto.randomUUID();
 const result=await db.batch([
  auditInsert(db,actor,{id:eventId,action:'content.'+(input.hidden?'hide':'restore'),entityType:input.kind,entityId:id,reason:input.reason,before:{hidden:previous.hidden},after:{hidden:input.hidden},now},guard),
  db.prepare(`INSERT INTO control_content(entity_type,entity_id,hidden,reason,revision,created_at,updated_at)
    SELECT ?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM control_audit_events WHERE id=?)
    ON CONFLICT(entity_type,entity_id) DO UPDATE SET hidden=excluded.hidden,reason=excluded.reason,revision=control_content.revision+1,updated_at=excluded.updated_at WHERE control_content.revision=?`)
    .bind(input.kind,id,Number(input.hidden),input.reason,now,now,eventId,input.expectedRevision),
 ]);
 if(result[0]?.meta.changes!==1||result[1]?.meta.changes!==1)throw new InputError('This content or your permissions changed. Refresh before continuing.',409);
 // Restoring a member's moderation restriction never publishes a profile that
 // they subsequently made private; return its minimal operation result instead.
 if(input.kind==='profile'&&previous.sourceStatus==='private')return{...previous,hidden:input.hidden,reason:input.reason,revision:input.expectedRevision+1,updatedAt:now};
 return contentItem(db,input.kind,id);
}
export function contentListInput(search:URLSearchParams):ContentListInput{
 const kind=search.get('kind')??'all',visibility=search.get('visibility')??'all',q=(search.get('q')??'').trim();
 const page=Number(search.get('page')??1),pageSize=Number(search.get('pageSize')??20);
 if(!['all','profile','update'].includes(kind)||!['all','visible','hidden'].includes(visibility)||q.length>100||!Number.isSafeInteger(page)||page<1||page>10000||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>50)throw new InputError('Choose valid moderation filters.');
 return{kind:kind as ContentListInput['kind'],visibility:visibility as ContentListInput['visibility'],q,page,pageSize};
}
