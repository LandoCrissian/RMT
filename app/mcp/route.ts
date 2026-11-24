import { handleMcpRequest } from "@/lib/server/mcp";

export const dynamic = "force-dynamic";
export async function POST(request: Request) { return handleMcpRequest(request); }
