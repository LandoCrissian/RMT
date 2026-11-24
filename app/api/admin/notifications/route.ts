import {reviewAccountScope} from '@/lib/server/review-scope';
import {controlDatabase} from '@/lib/server/control-database';
import { InputError } from "@/lib/submission-validation";
import { handle, json, readMutation } from "@/lib/server/http";
import { database, requireAdmin, runtime } from "@/lib/server/runtime";
import { flushNotifications, notificationStatus } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    const actor=await requireAdmin(request);reviewAccountScope(request,actor.userId);
    if(!actor.capabilities.includes('health'))throw new InputError('Notification delivery is available to RMT administrators.',403);
    return json({notifications: await notificationStatus(controlDatabase(database(),actor), runtime())});
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const actor=await requireAdmin(request);reviewAccountScope(request,actor.userId);
    if(!actor.capabilities.includes('health'))throw new InputError('Notification delivery is available to RMT administrators.',403);
    const body = await readMutation(request);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || (body as Record<string, unknown>).action !== "retry") {
      throw new InputError("Choose retry to process queued notification attempts.");
    }
    const db = controlDatabase(database(),actor);
    const result = await flushNotifications(db, runtime(), 3);
    return json({result, notifications: await notificationStatus(db, runtime())});
  });
}
