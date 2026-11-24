import type {ControlOverview} from '@/lib/control';
import {catalog} from './repository';
import {activeControlMemberSql,contentVisibleSql,type ControlActor} from './control-access';
import {canonicalMemberSql,controlObservedSince} from './control-members';
export async function controlOverview(db:D1Database,actor:ControlActor,now=Date.now()):Promise<ControlOverview>{
 const directory=await catalog(db),ids=JSON.stringify(directory.projects.map(project=>project.id));
 const row=await db.prepare(`SELECT
 (SELECT COUNT(*) FROM control_members m WHERE ${canonicalMemberSql}) AS members,
 (SELECT COUNT(*) FROM control_members m WHERE ${canonicalMemberSql} AND first_seen_at IS NOT NULL) AS observedMembers,
 (SELECT COUNT(*) FROM control_members m WHERE ${canonicalMemberSql} AND status='active' AND last_seen_at>=?) AS activeLast7Days,
 (SELECT COUNT(DISTINCT user_id) FROM project_owners o WHERE status='active' AND ${activeControlMemberSql('o.user_id')} AND project_id IN(SELECT value FROM json_each(?))) AS confirmedBuilders,
 (SELECT COUNT(*) FROM submissions WHERE status='pending') AS pendingSubmissions,
 (SELECT COUNT(*) FROM project_claims WHERE status='pending') AS pendingClaims,
 (SELECT COUNT(*) FROM project_edits WHERE status='pending') AS pendingEdits,
 (SELECT COUNT(*) FROM project_updates WHERE status='pending') AS pendingUpdates,
 (SELECT COUNT(*) FROM control_members m WHERE ${canonicalMemberSql} AND status='suspended') AS suspendedMembers,
 (SELECT COUNT(*) FROM profiles p WHERE visibility='public' AND ${activeControlMemberSql('p.user_id')} AND ${contentVisibleSql('profile','p.user_id')}) AS publicProfiles`)
 .bind(now-7*86_400_000,ids).first<Record<string,number>>();
 if(!row)throw new Error('Overview unavailable');
 return{role:actor.role,capabilities:actor.capabilities,generatedAt:now,observedSince:await controlObservedSince(db),metrics:{members:Number(row.members),observedMembers:Number(row.observedMembers),activeLast7Days:Number(row.activeLast7Days),listedProjects:directory.projects.length,confirmedBuilders:Number(row.confirmedBuilders),pendingSubmissions:Number(row.pendingSubmissions),pendingClaims:Number(row.pendingClaims),pendingEdits:Number(row.pendingEdits),pendingUpdates:Number(row.pendingUpdates),suspendedMembers:Number(row.suspendedMembers),publicProfiles:Number(row.publicProfiles)}};
}
