import {InputError} from '@/lib/submission-validation';
import {controlCursor,controlLimit,nextControlCursor,type ControlActor} from './control-access';
import {controlMembers} from './control-members';
import {controlAudit} from './control-audit';
import {controlProjects} from './control-projects';
export const CONTROL_EXPORT_DATASETS=['members','projects','ownership','audit'] as const;
export function csvCell(value:unknown):string{
 let text=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
 // CSV files can be opened in spreadsheets: neutralize executable cell prefixes.
 if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
export async function controlExport(db:D1Database,actor:ControlActor,query:URLSearchParams,configured:unknown,now=Date.now()):Promise<Response>{
 if(!actor.capabilities.includes('exports'))throw new InputError('Your RMT role does not allow exports.',403);
 const dataset=query.get('dataset')??'members',format=query.get('format')??'json',limit=controlLimit(query.get('limit'),500,100),cursor=query.get('cursor');
 if(!CONTROL_EXPORT_DATASETS.includes(dataset as typeof CONTROL_EXPORT_DATASETS[number])||!['json','csv'].includes(format))throw new InputError('Choose a valid export dataset and format.');
 let items:Record<string,unknown>[]=[],nextCursor:string|null=null,hasMore=false;
 if(dataset==='members'){
  const input=new URLSearchParams({limit:String(limit)});if(cursor)input.set('cursor',cursor);
  const result=await controlMembers(db,input,configured,500);items=result.items.map(item=>({...item,profile:undefined}));nextCursor=result.nextCursor;hasMore=result.hasMore;
 }else if(dataset==='audit'){
  const input=new URLSearchParams({limit:String(limit)});if(cursor)input.set('cursor',cursor);
  const result=await controlAudit(db,input,500);items=result.items;nextCursor=result.nextCursor;hasMore=result.hasMore;
 }else if(dataset==='projects'){
  const scope='export-projects:'+limit,decoded=controlCursor(cursor,scope),page=decoded?Number(decoded):1;
  if(!Number.isSafeInteger(page)||page<1||page>10000)throw new InputError('This export page is not valid.');
  const result=await controlProjects(db,{q:'',visibility:'all',category:'all',page,pageSize:limit});
  items=result.projects.map(item=>({id:item.project.id,slug:item.project.slug,name:item.project.name,description:item.project.description,category:item.project.category,stage:item.project.stage,website:item.project.website,launchUrl:item.project.launchUrl,links:item.project.links,visibility:item.visibility,featured:item.featured,source:item.origin,ownerId:item.owner?.userId??null,ownershipStatus:item.owner?.status??null,revision:item.revision,listingRevision:item.listingRevision,updatedAt:item.updatedAt}));
  hasMore=result.hasMore;nextCursor=hasMore?nextControlCursor(String(page+1),scope):null;
 }else{
  const scope='export-ownership',after=controlCursor(cursor,scope),args:(string|number)[]=after?[after]:[];
  const result=await db.prepare(`SELECT project_id,user_id,status,revision,created_at,updated_at FROM project_owners ${after?'WHERE project_id>?':''} ORDER BY project_id LIMIT ?`).bind(...args,limit+1).all<{project_id:string;user_id:string;status:string;revision:number;created_at:number;updated_at:number}>();
  hasMore=result.results.length>limit;items=result.results.slice(0,limit).map(row=>({projectId:row.project_id,userId:row.user_id,status:row.status,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at}));
  nextCursor=hasMore&&items.length?nextControlCursor(String(items.at(-1)!.projectId),scope):null;
 }
 const result={schemaVersion:1,exportedAt:now,dataset,items,nextCursor,hasMore,scope:'Operational data export; excludes authentication credentials, image files, and full database restore data.'};
 let body:string;
 if(format==='json')body=JSON.stringify(result,null,2);
 else{const keys=items.length?Object.keys(items[0]).filter(key=>items.some(item=>item[key]!==undefined)):['No records'];body=[keys.map(csvCell).join(','),...items.map(item=>keys.map(key=>csvCell(item[key])).join(','))].join('\r\n');}
 if(new TextEncoder().encode(body).byteLength>2_000_000)throw new InputError('This export page is too large. Choose a smaller page size.',413);
 return new Response(body,{headers:{'Content-Type':format==='json'?'application/json; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="rmt-${dataset}-${new Date(now).toISOString().slice(0,10)}.${format}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-RMT-Has-More':String(hasMore),'X-RMT-Next-Cursor':nextCursor??''}});
}
