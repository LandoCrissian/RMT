import {getSeedProjects} from '@/lib/catalog';
import {activeControlMemberSql,contentVisibleSql} from './control-sql';

// Callers pass only static server-owned SQL expressions, never request input.
const curatedIds=getSeedProjects().map(project=>`'${project.id.replace(/'/g,"''")}'`).join(',')||"''";
export function publicProjectSql(projectId:string):string {
  return `((${projectId} IN (${curatedIds}) OR EXISTS(SELECT 1 FROM submissions cs WHERE 'community-'||cs.id=${projectId} AND cs.status='approved')
    OR EXISTS(SELECT 1 FROM project_controls ca WHERE ca.project_id=${projectId} AND ca.source='admin'))
    AND NOT EXISTS(SELECT 1 FROM project_controls cv WHERE cv.project_id=${projectId} AND cv.visibility<>'public'))`;
}
export function publicProfileSql(alias:string):string {
  return `${alias}.visibility='public' AND ${activeControlMemberSql(`${alias}.user_id`)} AND ${contentVisibleSql('profile',`${alias}.user_id`)}`;
}
export function publicUpdateControlSql(alias:string):string {
  return `${activeControlMemberSql(`${alias}.user_id`)} AND ${contentVisibleSql('update',`${alias}.id`)}`;
}
export type ProjectControlRow={project_id:string;source:'existing'|'admin';definition_json:string|null;name_override:string;payload_json:string|null;
  logo_asset_id:string|null;banner_asset_id:string|null;artwork_override:number;
  normalized_name:string|null;normalized_host:string|null;base_override_revision:number;visibility:'public'|'hidden'|'archived';featured:number|null;revision:number;created_at:number;updated_at:number};
