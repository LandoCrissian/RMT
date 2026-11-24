import { verifyFirebaseToken, sessionCookie, checkFirebaseAccount } from '@/lib/server/firebase-auth';
import { handle, json, readMutation } from '@/lib/server/http';
import { InputError } from '@/lib/submission-validation';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request) as {idToken?: unknown};
    if (typeof body?.idToken !== 'string' || body.idToken.length > 12000) throw new InputError('Sign in again.', 401);
    const user = await verifyFirebaseToken(body.idToken);
    await checkFirebaseAccount(body.idToken, user.firebaseUid, user.authTime);
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
