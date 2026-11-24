import { validateDecision } from "@/lib/submission-validation";
import { reviewSubmission } from "@/lib/server/repository";
import { database, requireAdmin } from "@/lib/server/runtime";
import { handle, json, readMutation } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return handle(async () => {
    const user = await requireAdmin(request);
    const decision = validateDecision(await readMutation(request));
    const {id} = await context.params;
    return json({submission: await reviewSubmission(database(), user.userId, id, decision)});
  });
}
