import {InputError} from '@/lib/submission-validation';
import {reviewSuggestions} from '@/lib/client/calendar-suggestions';
import {findPublicProject} from './repository';
import {object,official,eventFields} from './calendar';
import {publicProjectSql} from './control-visibility';
import {controlReason,controlRevision} from './control-access';

const actor='automation:official-sources';
const available='EXISTS(SELECT 1 FROM (SELECT ? AS candidate_project) WHERE '+publicProjectSql('candidate_project')+')';
async function hash(s:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');}
function bounded(v:unknown,max:number){if(typeof v!=='string'||!v.trim()||v.length>max)throw new InputError('Invalid source evidence.');return v.trim();}
export async function ingestSuggestion(db:D1Database,input:unknown,run:string){
  const b=object(input),project=await findPublicProject(db,bounded(b.projectId,128)),now=Date.now();
  const source=official(b.sourceUrl,project),reason='Official source review · GitHub Actions run '+run;
  if(b.kind==='calendar'){
    let suggestion;try{[suggestion]=reviewSuggestions({version:1,suggestions:[b.event]},new Set([project.id]));}catch{throw new InputError('Invalid calendar suggestion.');}
    if(suggestion.sourceUrl!==b.sourceUrl)throw new InputError('Source mismatch.');
    const data=eventFields(suggestion,project),draft=JSON.stringify(data),fingerprint=await hash(draft);
    if((data.endsAt??data.startsAt)<now)return {result:'expired'};
    const key=JSON.stringify([source,suggestion.sourceKey]),id=crypto.randomUUID();
    // Legacy/manual imports keep their moderation decisions. A changed source may
    // revise an automated submission, but cannot overwrite a manager's edited draft.
    const stmt=db.prepare(`INSERT INTO calendar_events(id,project_id,type_id,draft,status,actor,source,source_hash,created_at,updated_at,revision)
      SELECT ?,?,?,?,'pending',?,?,?,?,?,1 WHERE ${available} AND EXISTS(SELECT 1 FROM calendar_types WHERE id=? AND archived=0)
      ON CONFLICT(project_id,source) DO UPDATE SET draft=excluded.draft,type_id=excluded.type_id,status='pending',source_hash=excluded.source_hash,
      updated_at=excluded.updated_at,revision=calendar_events.revision+1
      WHERE calendar_events.actor=excluded.actor AND calendar_events.source_hash<>excluded.source_hash
      AND calendar_events.status NOT IN ('cancelled','removed','draft') AND NOT EXISTS(SELECT 1 FROM calendar_history h WHERE h.event_id=calendar_events.id AND h.action IN ('draft','submit') AND h.actor<>?)`)
      .bind(id,project.id,data.typeId,draft,actor,key,fingerprint,now,now,project.id,data.typeId,actor);
    const [result]=await db.batch([stmt,db.prepare("INSERT INTO calendar_history(event_id,actor,action,reason,revision,snapshot,created_at) SELECT id,?,'suggest',?,revision,draft,? FROM calendar_events WHERE project_id=? AND source=? AND changes()=1").bind(actor,reason,now,project.id,key)]);
    if(!result.meta.changes&&!await db.prepare('SELECT id FROM calendar_events WHERE project_id=? AND source=?').bind(project.id,key).first())throw new InputError('Project or event type unavailable.',409);
    return {result:result.meta.changes?'queued':'unchanged'};
  }
  if(b.kind!=='enrichment')throw new InputError('Unknown suggestion type.');
  const evidence=bounded(b.evidence,3500),id=await hash(project.id+'\n'+source);
  const result=await db.prepare(`INSERT INTO source_suggestions(id,project_id,project_name,source_url,evidence,updated_at)
    SELECT ?,?,?,?,?,? WHERE ${available}
    ON CONFLICT(id) DO UPDATE SET evidence=excluded.evidence,project_name=excluded.project_name,status='pending',revision=source_suggestions.revision+1,updated_at=excluded.updated_at
    WHERE source_suggestions.evidence<>excluded.evidence`).bind(id,project.id,project.name,source,evidence,now,project.id).run();
  return {result:result.meta.changes?'queued':'unchanged'};
}
export async function enrichmentQueue(db:D1Database){
 return (await db.prepare("SELECT id,project_name AS projectName,source_url AS sourceUrl,evidence,revision,updated_at AS updatedAt FROM source_suggestions WHERE status='pending' AND "+publicProjectSql('source_suggestions.project_id')+" ORDER BY updated_at,id LIMIT 100").all()).results;
}
export async function decideEnrichment(db:D1Database,input:unknown,actor:string){
 const b=object(input),id=bounded(b.id,64),rev=controlRevision(b.expectedRevision),reason=controlReason(b.reason);
 if(!/^[a-f0-9]{64}$/.test(id)||!['reviewed','dismissed'].includes(String(b.action)))throw new InputError('Invalid evidence review.');
 const [result]=await db.batch([db.prepare("UPDATE source_suggestions SET status=?,updated_at=?,revision=revision+1 WHERE id=? AND status='pending' AND revision=?").bind(String(b.action),Date.now(),id,rev),
   db.prepare('INSERT INTO calendar_history(event_id,actor,action,reason,revision,snapshot,created_at) SELECT id,?,?,?,revision,evidence,updated_at FROM source_suggestions WHERE id=? AND changes()=1').bind(actor,'enrichment-'+b.action,reason,id)]);
 if(!result.meta.changes)throw new InputError('The evidence changed. Refresh before reviewing.',409);
 return {ok:true};
}
