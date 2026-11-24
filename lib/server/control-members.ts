import type {ControlMember,ControlPage,ControlRole} from '@/lib/control';
import {InputError} from '@/lib/submission-validation';
import type {PlatformIdentity} from './auth';
import {controlActorGuard,controlCursor,controlId,controlLimit,controlObject,controlReason,controlRevision,nextControlCursor,protectedOwner,type ControlActor} from './control-access';
import {auditInsert} from './control-audit';
import {catalog} from './repository';

type MemberRow={user_id:string;email:string;display_name:string;providers_json:string;email_verified:number|null;first_seen_at:number|null;last_seen_at:number|null;historical_since_at:number|null;status:'active'|'suspended';status_reason:string;revision:number;role:ControlRole;role_revision:number;handle:string|null;profile_name:string|null;profile_visibility:'private'|'public'|null;project_count:number;submission_count:number};
type ObservedIdentity=PlatformIdentity&{signInProvider?:string};
export async function observeMember(db:D1Database,user:ObservedIdentity,now=Date.now()):Promise<void>{
 const provider=user.provider==='legacy'?'chatgpt':user.signInProvider==='google.com'?'google':user.signInProvider==='password'?'password':user.provider==='firebase'?'firebase':'unknown';
 await db.prepare(`INSERT INTO control_members(user_id,email,display_name,providers_json,email_verified,first_seen_at,last_seen_at,status,status_reason,revision,created_at,updated_at)
 VALUES(?,?,?,?,?,?,?,'active','',1,?,?) ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,email_verified=excluded.email_verified,
 first_seen_at=COALESCE(control_members.first_seen_at,excluded.first_seen_at),last_seen_at=MAX(COALESCE(control_members.last_seen_at,0),excluded.last_seen_at),
 providers_json=(SELECT json_group_array(value) FROM (SELECT DISTINCT value FROM json_each(control_members.providers_json) UNION SELECT value FROM json_each(excluded.providers_json)))
 WHERE control_members.last_seen_at IS NULL OR control_members.last_seen_at < ? OR control_members.email<>excluded.email OR control_members.display_name<>excluded.display_name
 OR control_members.email_verified IS NOT excluded.email_verified OR NOT EXISTS(SELECT 1 FROM json_each(control_members.providers_json) WHERE value=?)`)
 .bind(user.userId,user.email.slice(0,254),user.displayName.slice(0,100),JSON.stringify([provider]),user.emailVerified===undefined?null:Number(user.emailVerified),now,now,now,now,now-300_000,provider).run();
}
/** Preserve both identities' observed history; the alias row remains historical and is excluded from canonical lists. */
export async function mergeLinkedObservation(db:D1Database,firebaseUserId:string,canonicalUserId:string):Promise<void>{
 await db.prepare(`UPDATE control_members SET first_seen_at=(SELECT MIN(value) FROM (SELECT first_seen_at AS value FROM control_members WHERE user_id IN (?,?)) WHERE value IS NOT NULL),
 last_seen_at=(SELECT MAX(last_seen_at) FROM control_members WHERE user_id IN (?,?)),
 historical_since_at=(SELECT MIN(historical_since_at) FROM control_members WHERE user_id IN (?,?)),
 providers_json=(SELECT json_group_array(value) FROM (SELECT DISTINCT j.value FROM control_members m,json_each(m.providers_json) j WHERE m.user_id IN (?,?)))
 WHERE user_id=?`).bind(firebaseUserId,canonicalUserId,firebaseUserId,canonicalUserId,firebaseUserId,canonicalUserId,firebaseUserId,canonicalUserId,canonicalUserId).run();
}
const canonicalWhere="NOT EXISTS(SELECT 1 FROM account_links al WHERE 'firebase:'||al.firebase_uid=m.user_id AND al.legacy_user_id<>m.user_id)";
function owners(configured:unknown){return typeof configured==='string'?configured.split(',').map(x=>x.trim()).filter(Boolean):[];}
function memberSql(){return `SELECT m.*,CASE WHEN m.user_id IN(SELECT value FROM json_each(?)) THEN 'owner' ELSE COALESCE(r.role,'member') END AS role,COALESCE(r.revision,0) AS role_revision,
 p.handle,p.display_name AS profile_name,p.visibility AS profile_visibility,
 (SELECT COUNT(*) FROM project_owners o WHERE o.user_id=m.user_id AND o.status='active') AS project_count,
 (SELECT COUNT(*) FROM submissions s WHERE s.user_id=m.user_id) AS submission_count
 FROM control_members m LEFT JOIN control_roles r ON r.user_id=m.user_id LEFT JOIN profiles p ON p.user_id=m.user_id WHERE ${canonicalWhere}`;}
function memberDto(row:MemberRow):ControlMember{
 let providers:string[]=[];try{const v=JSON.parse(row.providers_json);if(Array.isArray(v))providers=v.filter(x=>typeof x==='string');}catch{}
 return{id:row.user_id,displayName:row.display_name||row.profile_name||'RMT member',email:row.email,providers,emailVerified:row.email_verified===null?null:row.email_verified===1,
 firstSeenAt:row.first_seen_at,lastSeenAt:row.last_seen_at,historicalSinceAt:row.historical_since_at,status:row.role==='owner'?'active':row.status,statusReason:row.status_reason,revision:row.revision,
 role:row.role,roleRevision:row.role_revision,protectedOwner:row.role==='owner',profile:row.profile_visibility?{handle:row.handle,displayName:row.profile_name??'',visibility:row.profile_visibility}:null,
 projectCount:Number(row.project_count),submissionCount:Number(row.submission_count)};
}
export async function controlMember(db:D1Database,id:string,configured:unknown):Promise<ControlMember>{
 controlId(id);const row=await db.prepare(memberSql()+' AND m.user_id=?').bind(JSON.stringify(owners(configured)),id).first<MemberRow>();
 if(!row)throw new InputError('This member was not found. Ask them to sign in to RMT first.',404);return memberDto(row);
}
export async function controlObservedSince(db:D1Database){const row=await db.prepare('SELECT observed_since FROM control_installation WHERE id=1').first<{observed_since:number}>();if(!row)throw new Error('Control installation metadata missing');return row.observed_since;}
export async function controlMembers(db:D1Database,query:URLSearchParams,configured:unknown,max=50):Promise<ControlPage<ControlMember>&{observedSince:number}>{
 const q=(query.get('q')??'').trim();if(q.length>100)throw new InputError('Keep the member search under 100 characters.');
 const status=query.get('status')??'all',role=query.get('role')??'all';
 if(!['all','active','suspended'].includes(status)||!['all','owner','admin','moderator','member'].includes(role))throw new InputError('Choose a valid member filter.');
 const limit=controlLimit(query.get('limit'),max,Math.min(20,max)),scope=JSON.stringify({q,status,role}),after=controlCursor(query.get('cursor'),scope),where:string[]=[],args:(string|number)[]=[JSON.stringify(owners(configured))];
 if(q){where.push("instr(lower(user_id||' '||email||' '||display_name||' '||COALESCE(handle,'')),?)>0");args.push(q.toLowerCase());}
 if(status!=='all'){where.push("CASE WHEN role='owner' THEN 'active' ELSE status END=?");args.push(status);}
 if(role!=='all'){where.push('role=?');args.push(role);}
 if(after){where.push('user_id>?');args.push(after);}
 const result=await db.prepare(`SELECT * FROM (${memberSql()}) ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY user_id ASC LIMIT ?`).bind(...args,limit+1).all<MemberRow>();
 const hasMore=result.results.length>limit,items=result.results.slice(0,limit).map(memberDto),last=items.at(-1);
 return{items,hasMore,nextCursor:hasMore&&last?nextControlCursor(last.id,scope):null,observedSince:await controlObservedSince(db)};
}
export async function controlMemberDetail(db:D1Database,id:string,configured:unknown){
 const member=await controlMember(db,id,configured),directory=await catalog(db),names=new Map(directory.projects.map(p=>[p.id,p.name]));
 const rows=await db.prepare('SELECT project_id,status FROM project_owners WHERE user_id=? ORDER BY project_id LIMIT 200').bind(id).all<{project_id:string;status:string}>();
 const audit=await db.prepare('SELECT id,actor_id,action,entity_type,entity_id,reason,created_at FROM control_audit_events WHERE entity_id=? ORDER BY created_at DESC,id DESC LIMIT 10').bind(id).all<{id:string;actor_id:string;action:string;entity_type:string;entity_id:string;reason:string;created_at:number}>();
 return{member,projects:rows.results.map(row=>({id:row.project_id,name:names.get(row.project_id)??row.project_id,status:row.status})),recentAudit:audit.results.map(row=>({id:row.id,actorId:row.actor_id,action:row.action,entityType:row.entity_type,entityId:row.entity_id,reason:row.reason,createdAt:row.created_at}))};
}
export async function setMemberStatus(db:D1Database,actor:ControlActor,id:string,value:unknown,configured:unknown){
 if(!actor.capabilities.includes('members'))throw new InputError('Your RMT role does not allow member management.',403);
 const input=controlObject(value,['action','expectedRevision','reason']),revision=controlRevision(input.expectedRevision),reason=controlReason(input.reason);
 if(!['suspend','restore'].includes(String(input.action)))throw new InputError('Choose suspend or restore.');
 const member=await controlMember(db,id,configured);if(member.protectedOwner||id===actor.userId)throw new InputError('The site owner and your own account cannot be suspended here.',403);
 if(member.revision!==revision)throw new InputError('This member changed. Refresh before saving.',409);
 const status=input.action==='suspend'?'suspended':'active';if(member.status===status)throw new InputError('This member already has that status. Refresh the member list.',409);
 const actorCheck=controlActorGuard(actor),now=Date.now();
 const guard={sql:`EXISTS(SELECT 1 FROM control_members m WHERE user_id=? AND revision=? AND status=? AND ${canonicalWhere})`,args:[id,revision,member.status]};
 const results=await db.batch([
 auditInsert(db,actor,{action:'member.'+input.action,entityType:'member',entityId:id,reason,before:{status:member.status},after:{status},now},guard),
 db.prepare(`UPDATE control_members SET status=?,status_reason=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? AND status=? AND NOT EXISTS(SELECT 1 FROM account_links al WHERE 'firebase:'||al.firebase_uid=control_members.user_id AND al.legacy_user_id<>control_members.user_id) AND ${actorCheck.sql}`)
 .bind(status,reason,now,id,revision,member.status,...actorCheck.args),
 ]);
 if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('This member or your permissions changed. Refresh before saving.',409);
 return{member:await controlMember(db,id,configured)};
}
export async function setControlRole(db:D1Database,actor:ControlActor,value:unknown,configured:unknown){
 if(actor.role!=='owner')throw new InputError('Only the protected site owner can manage access.',403);
 const input=controlObject(value,['userId','role','expectedRevision','reason']),id=controlId(input.userId),revision=controlRevision(input.expectedRevision),reason=controlReason(input.reason);
 if(!['member','admin','moderator'].includes(String(input.role)))throw new InputError('Choose a valid access role.');
 const member=await controlMember(db,id,configured);if(member.protectedOwner||id===actor.userId)throw new InputError('Protected owner access cannot be changed here.',403);
 if(member.status!=='active')throw new InputError('Restore this member before changing their access.',409);
 if(member.roleRevision!==revision)throw new InputError('This role changed. Refresh before saving.',409);
 if(member.role===input.role)throw new InputError('This member already has that role.',409);
 const now=Date.now(),guard={sql:`EXISTS(SELECT 1 FROM control_members m WHERE user_id=? AND status='active' AND revision=? AND ${canonicalWhere}) AND COALESCE((SELECT revision FROM control_roles WHERE user_id=?),0)=?`,args:[id,member.revision,id,revision]};
 const results=await db.batch([
 auditInsert(db,actor,{action:'role.set',entityType:'role',entityId:id,reason,before:{role:member.role},after:{role:input.role},now},guard),
 db.prepare(`INSERT INTO control_roles(user_id,role,revision,updated_at,updated_by) SELECT ?,?,?,?,? WHERE ${guard.sql}
 ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,revision=control_roles.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE control_roles.revision=?`)
 .bind(id,String(input.role),revision+1,now,actor.userId,...guard.args,revision),
 ]);
 if(results[0]?.meta.changes!==1||results[1]?.meta.changes!==1)throw new InputError('This member or role changed. Refresh before saving.',409);
 return{member:await controlMember(db,id,configured)};
}
export {canonicalWhere as canonicalMemberSql};
