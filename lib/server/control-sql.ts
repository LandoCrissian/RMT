/** Only pass fixed application SQL expressions, never request data. */
export function activeControlMemberSql(userIdExpression:string){return `NOT EXISTS(SELECT 1 FROM control_members cm WHERE cm.user_id=${userIdExpression} AND cm.status='suspended')`;}
export function contentVisibleSql(type:'profile'|'update',idExpression:string){return `NOT EXISTS(SELECT 1 FROM control_content cc WHERE cc.entity_type='${type}' AND cc.entity_id=${idExpression} AND cc.hidden=1)`;}
