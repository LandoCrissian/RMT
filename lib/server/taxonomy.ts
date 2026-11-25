import type {Classification,TaxonomyCategory} from '../taxonomy';
import {InputError} from '../submission-validation';
export async function checkActiveSelection(db:D1Database,ids?:string[]){
  if(!ids?.length)return;
  const result=await db.prepare('SELECT count(*) n FROM taxonomy_categories WHERE archived=0 AND id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).first<{n:number}>();
  if(result?.n!==ids.length)throw new InputError('A selected category is unavailable. Refresh the category choices.',409);
}
export async function readTaxonomy(db:D1Database){
  const [definitions,rows]=await Promise.all([
    db.prepare('SELECT id,name,position,archived FROM taxonomy_categories WHERE archived=0 ORDER BY position,name').all<TaxonomyCategory>(),
    db.prepare('SELECT p.project_id,p.category_id,p.is_primary FROM project_categories p JOIN taxonomy_categories c ON c.id=p.category_id AND c.archived=0 ORDER BY p.project_id,p.is_primary DESC,c.position,c.name').all<{project_id:string;category_id:string;is_primary:number}>()
  ]);
  const categories=definitions.results.map(c=>({...c,archived:Boolean(c.archived)}));
  const names=new Map(categories.map(c=>[c.id,c.name])),assignments=new Map<string,Classification>();
  for(const row of rows.results){
    if(row.is_primary)assignments.set(row.project_id,{primary:row.category_id,secondary:[],labels:{}});
    const project=assignments.get(row.project_id);
    if(project){if(!row.is_primary)project.secondary.push(row.category_id);project.labels[row.category_id]=names.get(row.category_id)!;}
  }
  return {categories,assignments};
}
