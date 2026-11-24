import { identity, isAdmin } from "@/lib/server/runtime";
import { json, handle } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    const user = await identity(request);
    return json({authenticated: Boolean(user), userId: user?.userId ?? null,
      displayName: user?.displayName ?? null, emailVerified: user?.emailVerified ?? false,
      provider: user?.provider ?? null, isAdmin: user?.emailVerified ? await isAdmin(request) : false});
  });
}
