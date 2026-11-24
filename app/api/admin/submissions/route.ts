import { reviewQueue } from "@/lib/server/repository";
import { database, requireAdmin } from "@/lib/server/runtime";
import { handle, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => { await requireAdmin(request); return json({submissions: await reviewQueue(database())}); });
}
