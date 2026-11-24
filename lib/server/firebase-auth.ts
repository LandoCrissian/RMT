import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { firebaseConfig } from '../firebase-config';
import { InputError } from '../submission-validation';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
export const sessionCookie = '__Host-rmt-session';

export async function verifyFirebaseToken(token: string, keySet: JWTVerifyGetKey = keys, now = new Date()) {
  try {
    const { payload } = await jwtVerify(token, keySet, {
      algorithms: ['RS256'], audience: firebaseConfig.projectId,
      issuer: 'https://securetoken.google.com/' + firebaseConfig.projectId,
      currentDate: now, requiredClaims: ['exp', 'iat', 'auth_time', 'sub'],
    });
    if (!payload.sub || payload.sub.length > 128 || typeof payload.email !== 'string' || payload.email.length > 254 ||
      typeof payload.auth_time !== 'number' || payload.auth_time > now.getTime() / 1000 ||
      typeof payload.iat !== 'number' || payload.iat > now.getTime() / 1000) throw new Error('Invalid identity');
    return { userId: 'firebase:' + payload.sub, firebaseUid: payload.sub, email: payload.email,
      displayName: typeof payload.name === 'string' ? payload.name.slice(0, 100) : 'RMT member',
      emailVerified: payload.email_verified === true, authTime: payload.auth_time, expiresAt: payload.exp!,
      signInProvider: payload.firebase && typeof payload.firebase === 'object' && 'sign_in_provider' in payload.firebase && typeof payload.firebase.sign_in_provider === 'string' ? payload.firebase.sign_in_provider.slice(0,80) : 'unknown' };
  } catch { throw new InputError('Your sign-in expired. Please sign in again.', 401); }
}

export function cookieValue(request: Request, name: string) {
  return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
}

// Check disabled/deleted accounts and token revocation before issuing a cookie.
export async function checkFirebaseAccount(token: string, uid: string, authTime: number) {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + firebaseConfig.apiKey,
    {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({idToken: token}), signal: AbortSignal.timeout(8000)});
  if (!response.ok) throw new InputError('Please sign in again.', 401);
  const data = await response.json() as {users?: Array<{localId: string; disabled?: boolean; validSince?: string}>};
  const user = data.users?.find(user => user.localId === uid);
  if (!user || user.disabled || Number(user.validSince || 0) > authTime) throw new InputError('Please sign in again.', 401);
}
