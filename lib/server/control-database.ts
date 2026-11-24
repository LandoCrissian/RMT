import {InputError} from '@/lib/submission-validation';
import {controlActorGuard,type ControlActor} from './control-access';
/** Keep existing review/audit functions atomic while adding current delegated-role checks.
 * D1 batch is one transaction: a failed assertion rolls back every following write.
 */
export function controlDatabase(db:D1Database,actor:ControlActor):D1Database{
 if(actor.role==='owner')return db;
 const permission=controlActorGuard(actor),originals=new WeakMap<object,D1PreparedStatement>();
 const assertion=()=>db.prepare(`SELECT CASE WHEN (${permission.sql}) THEN 1 ELSE json('RMT_CONTROL_ACCESS_REVOKED') END AS authorized`).bind(...permission.args);
 async function current(){const value=await db.prepare(`SELECT CASE WHEN (${permission.sql}) THEN 1 ELSE 0 END AS allowed`).bind(...permission.args).first<{allowed:number}>();return value?.allowed===1;}
 async function guarded(statements:D1PreparedStatement[]){
  try{return (await db.batch([assertion(),...statements.map(statement=>originals.get(statement)??statement)])).slice(1);}
  catch(error){if(!await current())throw new InputError('Your RMT permissions changed. Refresh the Control Center.',403);throw error;}
 }
 function wrap(statement:D1PreparedStatement):D1PreparedStatement{
  const wrapped=new Proxy(statement,{get(target,key){
   if(key==='bind')return(...values:unknown[])=>wrap(target.bind(...values));
   if(key==='run')return async()=>{const result=await guarded([target]);return result[0];};
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});originals.set(wrapped,statement);return wrapped;
 }
 return new Proxy(db,{get(target,key){
  if(key==='prepare')return(sql:string)=>wrap(target.prepare(sql));
  if(key==='batch')return guarded;
  if(key==='exec')return()=>{throw new InputError('This database operation is not available through delegated access.',403);};
  const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
 }});
}
