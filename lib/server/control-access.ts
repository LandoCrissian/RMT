import {InputError} from '@/lib/submission-validation';
import {CONTROL_CAPABILITIES,type ControlCapability,type ControlRole} from '@/lib/control';
import {isAdministrator,type PlatformIdentity} from './auth';
import {database,requireIdentity,runtime} from './runtime';
import {activeControlMemberSql} from './control-sql';
export {activeControlMemberSql,contentVisibleSql} from './control-sql';

export type ControlActor=PlatformIdentity&{role:Exclude<ControlRole,'member'>;roleRevision:number;capabilities:ControlCapability[]};
export function capabilitiesForRole(role:ControlRole):ControlCapability[]{
 if(role==='owner')return [...CONTROL_CAPABILITIES];
 if(role==='admin')return CONTROL_CAPABILITIES.filter(value=>value!=='roles');
 if(role==='moderator')return ['overview','review','content'];
 return [];
}
export function protectedOwner(userId:string,configuredIds:unknown){return isAdministrator(userId,configuredIds);}
export async function memberSuspended(db:D1Database,userId:string,configuredIds?:unknown){
 if(protectedOwner(userId,configuredIds))return false;
 return Boolean(await db.prepare("SELECT 1 AS found FROM control_members WHERE user_id=? AND status='suspended'").bind(userId).first());
}
export async function controlRole(db:D1Database,userId:string,configuredIds:unknown):Promise<{role:ControlRole;revision:number}>{
 if(protectedOwner(userId,configuredIds))return {role:'owner',revision:0};
 if(await memberSuspended(db,userId))return {role:'member',revision:0};
 const row=await db.prepare('SELECT role,revision FROM control_roles WHERE user_id=?').bind(userId).first<{role:'admin'|'moderator'|'member';revision:number}>();
 return {role:row?.role??'member',revision:row?.revision??0};
}
export async function requireControl(request:Request,capability:ControlCapability):Promise<ControlActor>{
 const user=await requireIdentity(request);
 if(request.headers.get('x-rmt-account')!==user.userId)throw new InputError('Your account changed. Refresh the Control Center before continuing.',409,'account_changed');
 const role=await controlRole(database(),user.userId,runtime().RMT_ADMIN_USER_IDS);
 const capabilities=capabilitiesForRole(role.role);
 if(role.role==='member'||!capabilities.includes(capability))throw new InputError('Your RMT role does not allow this action.',403);
 return {...user,role:role.role,roleRevision:role.revision,capabilities};
}
/** Repeat this guard inside every mutating SQL statement to close role-revocation races. */
export function controlActorGuard(actor:ControlActor):{sql:string;args:(string|number)[]}{
 if(actor.role==='owner')return {sql:'1=1',args:[]};
 return {sql:`${activeControlMemberSql('?')} AND EXISTS(SELECT 1 FROM control_roles cr WHERE cr.user_id=? AND cr.role=? AND cr.revision=?)`,args:[actor.userId,actor.userId,actor.role,actor.roleRevision]};
}
export function controlObject(value:unknown,allowed:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new InputError('This management request has unsupported fields.');
 return value as Record<string,unknown>;
}
export function controlReason(value:unknown):string{if(typeof value!=='string'||value.trim().length<5||value.trim().length>500)throw new InputError('Add a reason between 5 and 500 characters.');return value.trim();}
export function controlRevision(value:unknown):number{if(!Number.isSafeInteger(value)||Number(value)<0)throw new InputError('Refresh the record before saving.');return Number(value);}
export function controlId(value:unknown):string{if(typeof value!=='string'||!value||value.length>200||/[\u0000-\u001f\u007f]/.test(value))throw new InputError('Choose a valid member.');return value;}
export function controlQuery(request:Request,keys:string[]){const search=new URL(request.url).searchParams;for(const key of search.keys())if(!keys.includes(key)||search.getAll(key).length!==1)throw new InputError('This management filter is not valid.');return search;}
export function controlLimit(value:string|null,max=50,fallback=20){if(value===null)return fallback;if(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max)throw new InputError(`Choose a page size between 1 and ${max}.`);return Number(value);}
export function controlCursor(value:string|null,scope:string):string|null{
 if(!value)return null;if(value.length>2000)throw new InputError('This page link is not valid.');
 try{const decoded=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))));if(decoded.scope!==scope||typeof decoded.after!=='string'||decoded.after.length>500)throw new Error();return decoded.after;}catch{throw new InputError('This page link no longer matches its filters.');}
}
export function nextControlCursor(after:string,scope:string){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({after,scope})))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
