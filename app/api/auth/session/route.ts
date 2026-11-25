import { verifyFirebaseToken, sessionCookie, checkFirebaseAccount } from '@/lib/server/firebase-auth';
import { handle, json, readMutation } from '@/lib/server/http';
import { InputError } from '@/lib/submission-validation';
import {database,runtime} from '@/lib/server/runtime';
import {memberSuspended} from '@/lib/server/control-access';
import {observeMember} from '@/lib/server/control-members';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request) as {idToken?: unknown};
    if (typeof body?.idToken !== 'string' || body.idToken.length > 12000) throw new InputError('Sign in again.', 401);
    const user = await verifyFirebaseToken(body.idToken);
    const firebaseCreatedAt=await checkFirebaseAccount(body.idToken, user.firebaseUid, user.authTime);
    const db=database();
    const link=await db.prepare('SELECT legacy_user_id FROM account_links WHERE firebase_uid=?').bind(user.firebaseUid).first<{legacy_user_id:string}>();
    const canonical={...user,firebaseCreatedAt,userId:link?.legacy_user_id??user.userId,provider:'firebase'};
    await observeMember(db,canonical);
    if(await memberSuspended(db,canonical.userId,runtime().RMT_ADMIN_USER_IDS))throw new InputError('Your RMT account is suspended. Contact the site owner for help.',403);
    const response = json({ok: true, emailVerified: user.emailVerified});
    response.headers.append('Set-Cookie', `${sessionCookie}=${body.idToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(user.expiresAt - Date.now() / 1000))}`);
    response.headers.append('Set-Cookie', 'rmt-signed-out=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
    return response;
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    await readMutation(request);
    const response = json({ok: true});
    response.headers.append('Set-Cookie', `${sessionCookie}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
    response.headers.append('Set-Cookie', 'rmt-signed-out=1; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=31536000');
    return response;
  });
}
