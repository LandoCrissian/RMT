import { identityFromHeaders } from '@/lib/server/auth';
import { verifyFirebaseToken, checkFirebaseAccount } from '@/lib/server/firebase-auth';
import { database } from '@/lib/server/runtime';
import { handle, json, readMutation } from '@/lib/server/http';
import { InputError } from '@/lib/submission-validation';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handle(async () => {
    const body = await readMutation(request) as {idToken?: unknown};
    const legacy = identityFromHeaders(request.headers);
    if (!legacy) throw new InputError('First verify access to your original RMT account.', 401);
    if (typeof body?.idToken !== 'string' || body.idToken.length > 12000) throw new InputError('Sign in again.', 401);
    const user = await verifyFirebaseToken(body.idToken);
    if (!user.emailVerified || Date.now() / 1000 - user.authTime > 300) throw new InputError('Sign in to your verified Firebase account again before linking.', 403);
    await checkFirebaseAccount(body.idToken, user.firebaseUid, user.authTime);
    const db = database();
    const existing = await db.prepare('SELECT firebase_uid, legacy_user_id FROM account_links WHERE firebase_uid = ? OR legacy_user_id = ?')
      .bind(user.firebaseUid, legacy.userId).all<{firebase_uid: string; legacy_user_id: string}>();
    if (existing.results.some(link => link.firebase_uid !== user.firebaseUid || link.legacy_user_id !== legacy.userId)) throw new InputError('One of these accounts is already linked. Contact RMT.', 409);
    const activity = await db.prepare(`SELECT 1 AS found FROM saved_projects WHERE user_id = ?
      UNION ALL SELECT 1 FROM submissions WHERE user_id = ?
      UNION ALL SELECT 1 FROM project_claims WHERE user_id = ?
      UNION ALL SELECT 1 FROM project_edits WHERE user_id = ?
      UNION ALL SELECT 1 FROM project_updates WHERE user_id = ?
      UNION ALL SELECT 1 FROM project_artwork WHERE user_id = ?
      UNION ALL SELECT 1 FROM profiles WHERE user_id = ?
      UNION ALL SELECT 1 FROM profile_artwork WHERE user_id = ? LIMIT 1`)
      .bind(user.userId, user.userId, user.userId, user.userId, user.userId, user.userId, user.userId, user.userId).first();
    // Linking changes the canonical identity. Keep any existing profile,
    // uploaded image, or draft reachable instead of silently orphaning it.
    if (activity) throw new InputError('This new account already has saved activity. Contact RMT to combine accounts without losing records.', 409);
    // Both identities are proved on this request. No records or reviewer IDs change.
    await db.prepare('INSERT INTO account_links (firebase_uid, legacy_user_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING')
      .bind(user.firebaseUid, legacy.userId, Date.now()).run();
    const saved = await db.prepare('SELECT legacy_user_id FROM account_links WHERE firebase_uid = ?').bind(user.firebaseUid).first<{legacy_user_id: string}>();
    if (saved?.legacy_user_id !== legacy.userId) throw new InputError('Account linking changed. Try again.', 409);
    return json({ok: true});
  });
}
