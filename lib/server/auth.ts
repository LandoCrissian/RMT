export type PlatformIdentity = {userId: string; email: string; displayName: string};

/**
 * Trust these headers ONLY behind the Sites authentication dispatch, which supplies
 * authenticated visitor identity. A different host needs its own verified auth
 * adapter; never expose a direct origin that accepts user-supplied identity headers.
 */
export function identityFromHeaders(headers: Headers): PlatformIdentity | null {
  const userId = headers.get("oai-authenticated-user-id")?.trim();
  const email = headers.get("oai-authenticated-user-email")?.trim();
  if (!userId || !email || userId.length > 200 || email.length > 254) return null;
  let displayName = headers.get("oai-authenticated-user-full-name")?.trim() || "Builder";
  if (headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(displayName); } catch { displayName = "Builder"; }
  }
  return {userId, email, displayName: displayName.slice(0, 100)};
}

export function isAdministrator(userId: string | null | undefined, configuredIds: unknown): boolean {
  if (!userId || typeof configuredIds !== "string") return false;
  const ids = configuredIds.split(",").map(value => value.trim()).filter(Boolean);
  return ids.includes(userId);
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try { return new URL(origin).origin === new URL(request.url).origin && origin === new URL(origin).origin; }
  catch { return false; }
}
