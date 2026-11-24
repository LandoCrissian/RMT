import {InputError} from '@/lib/submission-validation';
import {isAdministrator} from './auth';
import {capabilitiesForRole,controlRole,type ControlActor} from './control-access';
import {controlDatabase} from './control-database';
import {activeControlMemberSql} from './control-sql';
import {database,requireIdentity,runtime} from './runtime';

/** A separate exact-ID grant for MCP alert summaries/receipts only. It is never a web role. */
export function configuredReviewMonitor(userId:string,configuredIds:unknown):boolean {
  return isAdministrator(userId,configuredIds);
}

/** Keep suspension checks effective even when they change during an alert receipt write. */
function monitorDatabase(db:D1Database,userId:string):D1Database {
  const permission=activeControlMemberSql('?'),originals=new WeakMap<object,D1PreparedStatement>();
  const assertion=()=>db.prepare(`SELECT CASE WHEN (${permission}) THEN 1 ELSE json('RMT_MONITOR_ACCESS_REVOKED') END AS authorized`).bind(userId);
  async function current(){const row=await db.prepare(`SELECT CASE WHEN (${permission}) THEN 1 ELSE 0 END AS allowed`).bind(userId).first<{allowed:number}>();return row?.allowed===1;}
  function revoked(){return new InputError('Review-alert access changed. Ask the site owner to check this account.',403);}
  async function guarded(statements:D1PreparedStatement[]){
    try{return (await db.batch([assertion(),...statements.map(statement=>originals.get(statement)??statement)])).slice(1);}
    catch(error){if(!await current())throw revoked();throw error;}
  }
  function wrap(statement:D1PreparedStatement):D1PreparedStatement {
    const wrapped=new Proxy(statement,{get(target,key){
      if(key==='bind')return(...values:unknown[])=>wrap(target.bind(...values));
      if(key==='run')return async()=>{const result=await guarded([target]);return result[0];};
      if(key==='all'||key==='first')return async(...args:unknown[])=>{
        if(!await current())throw revoked();
        const value=await Reflect.apply(Reflect.get(target,key),target,args);
        if(!await current())throw revoked();
        return value;
      };
      const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
    }});originals.set(wrapped,statement);return wrapped;
  }
  return new Proxy(db,{get(target,key){
    if(key==='prepare')return(sql:string)=>wrap(target.prepare(sql));
    if(key==='batch')return guarded;
    if(key==='exec')return()=>{throw new InputError('This operation is not available to the review-alert monitor.',403);};
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
}

/** Only the MCP digest and acknowledgement call this helper; review decisions still require requireAdmin. */
export async function requireReviewMonitor(request:Request) {
  const user=await requireIdentity(request),db=database(),env=runtime();
  const access=await controlRole(db,user.userId,env.RMT_ADMIN_USER_IDS),capabilities=capabilitiesForRole(access.role);
  if(access.role!=='member'&&capabilities.includes('review')){
    const actor:ControlActor={...user,role:access.role,roleRevision:access.revision,capabilities};
    return {userId:user.userId,db:controlDatabase(db,actor)};
  }
  if(!configuredReviewMonitor(user.userId,env.RMT_REVIEW_MONITOR_USER_IDS))throw new InputError('This account does not have RMT review-alert access.',403);
  return {userId:user.userId,db:monitorDatabase(db,user.userId)};
}
