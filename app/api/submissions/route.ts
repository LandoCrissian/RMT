import { validateSubmission } from "@/lib/submission-validation";
import { createSubmission, ownSubmissions } from "@/lib/server/repository";
import { database, requireIdentity, runtime } from "@/lib/server/runtime";
import { dispatchNotifications } from "@/lib/server/notifications";
import { handle, json, readMutation } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(async () => {
    const user = requireIdentity(request);
    return json({submissions: await ownSubmissions(database(), user.userId)});
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const user = requireIdentity(request);
    const input = validateSubmission(await readMutation(request));
    const db = database();
    const submission = await createSubmission(db, user, input);
    await dispatchNotifications(db, runtime());
    return json({submission}, 201);
  });
}
