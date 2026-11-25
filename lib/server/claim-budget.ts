import {InputError} from '@/lib/submission-validation';

export const DAILY_CLAIM_CHECK_LIMIT=120;

// Reserve the worst-case dual-provider verification before contacting an RPC.
// Unused capacity expires naturally after 24 hours. An interrupted call consumes its slot.
export async function reserveClaimRpc(db:D1Database,userId:string){
  const now=Date.now(), since=now-86_400_000;
  const result=await db.prepare(`INSERT INTO claim_rpc_usage(id,user_id,created_at)
    SELECT ?,?,? WHERE (SELECT COUNT(*) FROM claim_rpc_usage WHERE created_at>=?)<${DAILY_CLAIM_CHECK_LIMIT}
    AND (SELECT COUNT(*) FROM claim_rpc_usage WHERE user_id=? AND created_at>=?)<12`)
    .bind(crypto.randomUUID(),userId,now,since,userId,since).run();
  if(result.meta.changes!==1)throw new InputError('The daily wallet-check limit has been reached. Try later or submit manual evidence.',429);
}
