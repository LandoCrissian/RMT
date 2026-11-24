import { validateSubmission } from "@/lib/submission-validation";
import { createSubmission, ownSubmissions } from "@/lib/server/repository";
import { database, requireIdentity } from "@/lib/server/runtime";
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
    return json({submission: await createSubmission(database(), user, input)}, 201);
  });
}
