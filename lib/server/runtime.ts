import { env } from "cloudflare:workers";
import { InputError } from "@/lib/submission-validation";
import { identityFromHeaders } from "./auth";

import {controlRole,capabilitiesForRole,memberSuspended} from './control-access';
import {observeMember} from './control-members';
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
    const canonical={...user,userId:link?.legacy_user_id??user.userId,provider:"firebase"};
    await observeMember(database(),canonical);
    return {...canonical,suspended:await memberSuspended(database(),canonical.userId,runtime().RMT_ADMIN_USER_IDS)};
  }
  if (cookieValue(request, "rmt-signed-out") === "1") return null;
  const legacy = identityFromHeaders(request.headers);
  if(!legacy)return null;
  const user={...legacy,emailVerified:true,provider:"legacy"};
  await observeMember(database(),user);
  return {...user,suspended:await memberSuspended(database(),user.userId,runtime().RMT_ADMIN_USER_IDS)};
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
  if(user.suspended)throw new InputError("Your RMT account is suspended. Contact the site owner for help.",403);
  if (!user.emailVerified) throw new InputError("Verify your email before saving or submitting projects.", 403);
  return user;
}
export async function isAdmin(request: Request): Promise<boolean> {
  const user=await identity(request);
  if(!user||!user.emailVerified||user.suspended)return false;
  const access=await controlRole(database(),user.userId,runtime().RMT_ADMIN_USER_IDS);
  return capabilitiesForRole(access.role).includes('review');
}
export async function requireAdmin(request: Request) {
  const user = await requireIdentity(request);
  const access=await controlRole(database(),user.userId,runtime().RMT_ADMIN_USER_IDS);
  const capabilities=capabilitiesForRole(access.role);
  if(access.role==='member'||!capabilities.includes('review'))throw new InputError("This page is only available to an RMT reviewer.",403);
  return {...user,role:access.role,roleRevision:access.revision,capabilities};
}
