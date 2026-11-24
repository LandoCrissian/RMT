import { validateActivityPage } from '@/lib/activity';
import { publicActivity } from '@/lib/server/activity';
import { handle, json } from '@/lib/server/http';
import { database } from '@/lib/server/runtime';

export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return handle(async () => json(await publicActivity(database(), validateActivityPage(new URL(request.url)))));
}
