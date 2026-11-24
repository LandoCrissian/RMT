import { InputError } from "@/lib/submission-validation";
import { hasSameOrigin } from "./auth";

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {status, headers: {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}});
}

export async function readMutation(request: Request): Promise<unknown> {
  if (!hasSameOrigin(request)) throw new InputError("Please submit from the RMT website.", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new InputError("Send application/json.", 415);
  const length = request.headers.get("content-length");
  const limit = 16_384;
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new InputError("This application is too large.", 413);
  if (!request.body) throw new InputError("An application body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new InputError("This application is too large.", 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes)); }
  catch { throw new InputError("This application is not valid JSON."); }
}

export async function handle(operation: () => Promise<Response>): Promise<Response> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof InputError) return json({error: error.message}, error.status);
    console.error("RMT API operation failed", error instanceof Error ? error.name : "UnknownError");
    return json({error: "RMT could not save or load this request. Please try again later."}, 503);
  }
}
