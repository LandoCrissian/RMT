import { catalog } from "@/lib/server/repository";
import { database } from "@/lib/server/runtime";
import { handle, json } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() { return handle(async () => json(await catalog(database()))); }
