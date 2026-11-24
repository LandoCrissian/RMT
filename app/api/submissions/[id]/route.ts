import { InputError, validateSubmission } from "@/lib/submission-validation";
import { resubmit } from "@/lib/server/repository";
import { database, requireIdentity } from "@/lib/server/runtime";
import { handle, json, readMutation } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const user = requireIdentity(request);
    const body = await readMutation(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Send a valid application.");
    const {expectedRevision, ...fields} = body as Record<string, unknown>;
    if (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 1) throw new InputError("Refresh your application before updating it.", 409);
    const input = validateSubmission(fields);
    const {id} = await context.params;
    return json({submission: await resubmit(database(), user, id, input, expectedRevision as number)});
  });
}
