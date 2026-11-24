/** Durable notification intent only; provider dispatch happens after the write commits. */
export function pendingNotifications(db: D1Database, event: {
  kind:'submission'|'claim'|'edit'; id:string; projectName:string; revision:number; now:number;
}): D1PreparedStatement[] {
  const table = {submission:'submissions',claim:'project_claims',edit:'project_edits'}[event.kind];
  const key = `${event.kind}:${event.id}:revision:${event.revision}:pending`;
  return ['email'].map(channel => db.prepare(`
    INSERT INTO notification_outbox (id,event_key,kind,entity_id,project_name,channel,status,attempt_count,provider_id,last_error,payload_json,created_at,updated_at)
    SELECT ?,?,?,?,?,?,'pending',0,'','','',?,? FROM ${table}
    WHERE id=? AND revision=? AND status='pending'
    ON CONFLICT(event_key,channel) DO NOTHING
  `).bind(crypto.randomUUID(),key,event.kind,event.id,event.projectName,channel,event.now,event.now,event.id,event.revision));
}
