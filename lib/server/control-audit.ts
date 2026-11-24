import type {ControlAuditItem,ControlPage} from '@/lib/control';
import {InputError} from '@/lib/submission-validation';
import {controlActorGuard,controlCursor,controlLimit,nextControlCursor,type ControlActor} from './control-access';
export type AuditInput={action:string;entityType:string;entityId:string;reason:string;before?:unknown;after?:unknown;now?:number;id?:string};
export function auditInsert(db:D1Database,actor:ControlActor,input:AuditInput,guard?:{sql:string;args:(string|number|null)[]}):D1PreparedStatement{
 const permission=controlActorGuard(actor);
 return db.prepare(`INSERT INTO control_audit_events(id,actor_id,action,entity_type,entity_id,reason,before_json,after_json,created_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE (${permission.sql}) AND (${guard?.sql??'1=1'})`).bind(input.id??crypto.randomUUID(),actor.userId,input.action,input.entityType,input.entityId,input.reason,JSON.stringify(input.before??{}),JSON.stringify(input.after??{}),input.now??Date.now(),...permission.args,...(guard?.args??[]));
}
const auditUnion=`SELECT 'control-'||id AS id,actor_id,action,entity_type,entity_id,reason,created_at FROM control_audit_events
 UNION ALL SELECT 'submission-'||id,reviewer_id,'submission.'||next_status,'submission',submission_id,note,created_at FROM review_events
 UNION ALL SELECT 'claim-'||id,reviewer_id,'claim.'||next_status,'claim',claim_id,note,created_at FROM claim_review_events
 UNION ALL SELECT 'edit-'||id,reviewer_id,'edit.'||next_status,'edit',edit_id,note,created_at FROM edit_review_events
 UNION ALL SELECT 'update-'||id,actor_id,'update.'||next_status,'update',update_id,note,created_at FROM project_update_events`;
const kinds=['all','member','role','project','profile','update','settings','submission','claim','edit','export'];
export async function controlAudit(db:D1Database,query:URLSearchParams,max=50):Promise<ControlPage<ControlAuditItem>>{
 const q=(query.get('q')??'').trim();if(q.length>100)throw new InputError('Keep the audit search under 100 characters.');
 const kind=query.get('kind')??'all';if(!kinds.includes(kind))throw new InputError('Choose a valid history filter.');
 const limit=controlLimit(query.get('limit'),max,Math.min(20,max)),scope=JSON.stringify({q,kind}),cursor=controlCursor(query.get('cursor'),scope);
 let before:{at:number;id:string}|null=null;
 if(cursor){try{before=JSON.parse(cursor);if(!before||!Number.isSafeInteger(before.at)||before.at<0||typeof before.id!=='string'||before.id.length>250)throw new Error();}catch{throw new InputError('This history page is not valid.');}}
 const where:string[]=[],args:(string|number)[]=[];
 if(kind!=='all'){where.push('entity_type=?');args.push(kind);}
 if(q){where.push("lower(action||' '||entity_id||' '||reason) LIKE ? ESCAPE '\\'");args.push('%'+q.toLowerCase().replace(/[\\%_]/g,'\\$&')+'%');}
 if(before){where.push('(created_at<? OR (created_at=? AND id<?))');args.push(before.at,before.at,before.id);}
 const result=await db.prepare(`SELECT * FROM (${auditUnion}) ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(...args,limit+1).all<{id:string;actor_id:string;action:string;entity_type:string;entity_id:string;reason:string;created_at:number}>();
 const hasMore=result.results.length>limit,rows=result.results.slice(0,limit);
 const items=rows.map(row=>({id:row.id,actorId:row.actor_id,action:row.action,entityType:row.entity_type,entityId:row.entity_id,reason:row.reason,createdAt:row.created_at}));
 const last=items.at(-1);return{items,hasMore,nextCursor:hasMore&&last?nextControlCursor(JSON.stringify({at:last.createdAt,id:last.id}),scope):null};
}
