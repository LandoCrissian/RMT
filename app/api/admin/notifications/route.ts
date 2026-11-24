import { InputError } from "@/lib/submission-validation";
import { handle, json, readMutation } from "@/lib/server/http";
import { database, requireAdmin, runtime } from "@/lib/server/runtime";
import { flushNotifications, notificationStatus } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    requireAdmin(request);
    return json({notifications: await notificationStatus(database(), runtime())});
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    requireAdmin(request);
    const body = await readMutation(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || (body as Record<string, unknown>).action !== "retry") {
      throw new InputError("Choose retry to process queued notification attempts.");
    }
    const db = database();
    const result = await flushNotifications(db, runtime(), 3);
    return json({result, notifications: await notificationStatus(db, runtime())});
  });
}
