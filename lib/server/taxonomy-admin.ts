import {administrativeCatalog} from './repository';
import {controlDatabase} from './control-database';
import {controlObject,controlRevision,type ControlActor} from './control-access';
import {InputError} from '../submission-validation';
import {validSelection} from '../taxonomy';
import {checkActiveSelection} from './taxonomy';
import {suggestCategories} from '../category-suggestions.mjs';
import reviewed from '../reviewed-source-metadata.json';

export async function taxonomyWorkspace(db:D1Database){
 const [catalog,definitions,latest]=await Promise.all([administrativeCatalog(db),
  db.prepare('SELECT c.*,count(p.project_id) total FROM taxonomy_categories c LEFT JOIN project_categories p ON p.category_id=c.id GROUP BY c.id ORDER BY position,name').all(),
  db.prepare('SELECT coalesce(max(revision),0) revision FROM taxonomy_reviews').first<{revision:number}>()]);
 return {revision:latest!.revision,categories:definitions.results,projects:catalog.projects.map(p=>{
  const records=reviewed[p.id as keyof typeof reviewed]??[];
  const sources=new Set([p.website,p.launchUrl,...p.links.map(l=>l.url),...(p.collections??[]).map(c=>c.url)]);
  const suggestions=suggestCategories(records.filter(r=>sources.has(r.url)));
  return {id:p.id,name:p.name,classification:p.classification,suggestions,website:p.website,sourceUrls:[...sources].filter(Boolean)};
 })};
}
export async function updateTaxonomy(db:D1Database,actor:ControlActor,body:unknown){
 if(!['admin','owner'].includes(actor.role))throw new InputError('Administrator access required.',403);
 const v=controlObject(body,['action','revision','id','ids','name','position','archived']);
 const revision=controlRevision(v.revision);
 const latest=await db.prepare('SELECT coalesce(max(revision),0) revision FROM taxonomy_reviews').first<{revision:number}>();
 if(latest?.revision!==revision)throw new InputError('Categories changed. Reload before saving.',409);
 const secure=controlDatabase(db,actor);
 const id=String(v.id??''), action=String(v.action);
 let statements:D1PreparedStatement[];
 if(action==='assign'){
  if(!validSelection(v.ids))throw new InputError('Select one primary category and distinct secondary categories.');
  const {projects}=await administrativeCatalog(db);
  if(!projects.some(p=>p.id===id))throw new InputError('Choose an existing project.',404);
  await checkActiveSelection(db,v.ids);
  statements=[db.prepare('DELETE FROM project_categories WHERE project_id=?').bind(id),
   db.prepare('INSERT INTO project_categories(project_id,category_id,is_primary) SELECT ?,value,key=0 FROM json_each(?)').bind(id,JSON.stringify(v.ids))];
 }else{
  if(!['create','edit'].includes(action)||!/^([a-z][a-z0-9-]{0,59})$/.test(id)||typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>60||!Number.isSafeInteger(v.position)||Number(v.position)<0||Number(v.position)>10000||typeof v.archived!=='boolean')throw new InputError('Enter a category name and a sort position from 0 to 10000.');
  const exists=await db.prepare('SELECT 1 FROM taxonomy_categories WHERE id=?').bind(id).first();
  if(Boolean(exists)!==(action==='edit'))throw new InputError('This category changed. Refresh the list.',409);
  statements=[action==='create'?db.prepare('INSERT INTO taxonomy_categories(name,position,archived,id) VALUES(?,?,?,?)').bind(v.name.trim(),v.position,Number(v.archived),id):
   db.prepare('UPDATE taxonomy_categories SET name=?,position=?,archived=? WHERE id=?').bind(v.name.trim(),v.position,Number(v.archived),id)];
 }
 try{await secure.batch([db.prepare('INSERT INTO taxonomy_reviews(revision,actor,action,detail,reviewed_at) VALUES(?,?,?,?,?)').bind(revision+1,actor.userId,action,JSON.stringify(v),Date.now()),...statements]);}
 catch(error){if(/UNIQUE|Reassign projects|Category unavailable/i.test(String(error)))throw new InputError('A category is in use, its name already exists, or another review was saved. Reload and reassign projects before archiving.',409);throw error;}
 return {saved:true};
}
