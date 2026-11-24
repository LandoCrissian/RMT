import { env } from "cloudflare:workers";
import { InputError } from "@/lib/submission-validation";
import { identityFromHeaders, isAdministrator } from "./auth";

import { verifyFirebaseToken, cookieValue, sessionCookie, checkFirebaseAccount } from "./firebase-auth";

type RmtEnvironment = {DB?: D1Database; BUCKET?: R2Bucket; RMT_ADMIN_USER_IDS?: string};
export function runtime(): RmtEnvironment { return env as RmtEnvironment; }
export function database(): D1Database {
  const db = runtime().DB;
  if (!db) throw new InputError("The application service is not configured yet. Please try again later.", 503);
  return db;
}
async function resolveIdentity(request: Request) {
  const token = cookieValue(request, sessionCookie);
  if (token) {
    const user = await verifyFirebaseToken(token);
    await checkFirebaseAccount(token, user.firebaseUid, user.authTime);
    const link = await database().prepare("SELECT legacy_user_id FROM account_links WHERE firebase_uid = ?").bind(user.firebaseUid).first<{legacy_user_id: string}>();
    return {...user, userId: link?.legacy_user_id ?? user.userId, provider: "firebase"};
  }
  if (cookieValue(request, "rmt-signed-out") === "1") return null;
  const legacy = identityFromHeaders(request.headers);
  return legacy ? {...legacy, emailVerified: true, provider: "legacy"} : null;
}
// Weak keys keep verification scoped to this one request, including MCP calls.
const identities = new WeakMap<Request, ReturnType<typeof resolveIdentity>>();
export function identity(request: Request) {
  let value = identities.get(request);
  if (!value) {value = resolveIdentity(request); identities.set(request, value);}
  return value;
}
export async function requireIdentity(request: Request) {
  const user = await identity(request);
  if (!user) throw new InputError("Sign in to submit or manage a project.", 401);
  if (!user.emailVerified) throw new InputError("Verify your email before saving or submitting projects.", 403);
  return user;
}
export async function isAdmin(request: Request): Promise<boolean> {
  return isAdministrator((await identity(request))?.userId, runtime().RMT_ADMIN_USER_IDS);
}
export async function requireAdmin(request: Request) {
  const user = await requireIdentity(request);
  if (!isAdministrator(user.userId, runtime().RMT_ADMIN_USER_IDS)) throw new InputError("This page is only available to an RMT reviewer.", 403);
  return user;
}
