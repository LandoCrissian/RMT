import { identity, isAdmin } from "@/lib/server/runtime";
import { json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = identity(request);
  return json({authenticated: Boolean(user), userId: user?.userId ?? null,
    displayName: user?.displayName ?? null, isAdmin: isAdmin(request)});
}
