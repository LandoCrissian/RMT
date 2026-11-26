import {hasSameOrigin} from '@/lib/server/auth';
import {checkFirebaseAccount, cookieValue, sessionCookie, verifyFirebaseToken} from '@/lib/server/firebase-auth';
import {readJsonBody} from '@/lib/server/http';
import {recoveryCapacity} from '@/lib/server/recovery-capacity';
import {database, runtime} from '@/lib/server/runtime';
import {InputError} from '@/lib/submission-validation';

export const dynamic = 'force-dynamic';
const maximumWindowMs = 10 * 60_000;
type RecoveryConfig = ReturnType<typeof runtime> & {
  RMT_RECOVERY_OWNER_UID?: string;
  RMT_RECOVERY_START?: string;
  RMT_RECOVERY_UNTIL?: string;
};

const headers = {'Cache-Control':'private, no-store, max-age=0', 'CDN-Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff'};

function response(body:unknown, status = 200) {
  return Response.json(body,{status,headers});
}
function closed() {
  return response({error:'Recovery capacity is unavailable.'},404);
}

export const GET = closed;
export const HEAD = () => new Response(null,{status:404,headers});
export const OPTIONS = closed;
export const PUT = closed;
export const PATCH = closed;
export const DELETE = closed;

export async function POST(request:Request) {
  try {
    const config = runtime() as RecoveryConfig;
    const start = Date.parse(config.RMT_RECOVERY_START ?? '');
    const end = Date.parse(config.RMT_RECOVERY_UNTIL ?? '');
    const ownerUid = config.RMT_RECOVERY_OWNER_UID;
    const owners = (config.RMT_ADMIN_USER_IDS ?? '').split(',').map(value => value.trim());
    const active = (now:number) => Number.isFinite(start) && Number.isFinite(end) &&
      start <= now && now < end && end - start <= maximumWindowMs;
    if (!ownerUid || !owners.includes('firebase:' + ownerUid) || !active(Date.now())) return closed();
    if (!hasSameOrigin(request)) return response({error:'Use the signed-in RMT site.'},403);
    const token = cookieValue(request,sessionCookie);
    if (!token || token.length > 8192) return response({error:'Fresh owner sign-in required.'},401);
    const identity = await verifyFirebaseToken(token);
    if (identity.firebaseUid !== ownerUid || !identity.emailVerified ||
        !['password','google.com'].includes(identity.signInProvider)) {
      return response({error:'Recovery capacity requires the configured Firebase owner.'},403);
    }
    if (Date.now() - identity.authTime * 1000 > 300_000) {
      return response({error:'Fresh owner sign-in required.'},401);
    }
    await checkFirebaseAccount(token,identity.firebaseUid,identity.authTime);
    const input = await readJsonBody(request);
    if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 ||
        !('action' in input) || input.action !== 'capacity') return closed();
    if (!active(Date.now())) return closed();
    const result = await recoveryCapacity(database());
    return active(Date.now()) ? response(result) : closed();
  } catch (error) {
    // Do not forward exception text, request headers, provider responses or storage results to logging.
    const status = error instanceof InputError ? error.status : 503;
    return response({error:'Recovery capacity request could not be completed.'},status);
  }
}
