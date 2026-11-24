import { env } from "cloudflare:workers";
import { InputError } from "@/lib/submission-validation";
import { identityFromHeaders, isAdministrator } from "./auth";

type RmtEnvironment = {DB?: D1Database; RMT_ADMIN_USER_IDS?: string};
export function runtime(): RmtEnvironment { return env as RmtEnvironment; }
export function database(): D1Database {
  const db = runtime().DB;
  if (!db) throw new InputError("The application service is not configured yet. Please try again later.", 503);
  return db;
}
export function identity(request: Request) { return identityFromHeaders(request.headers); }
export function requireIdentity(request: Request) {
  const user = identity(request);
  if (!user) throw new InputError("Sign in to submit or manage a project.", 401);
  return user;
}
export function isAdmin(request: Request): boolean {
  return isAdministrator(identity(request)?.userId, runtime().RMT_ADMIN_USER_IDS);
}
export function requireAdmin(request: Request) {
  const user = requireIdentity(request);
  if (!isAdministrator(user.userId, runtime().RMT_ADMIN_USER_IDS)) throw new InputError("This page is only available to an RMT reviewer.", 403);
  return user;
}
