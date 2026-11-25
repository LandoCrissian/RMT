import {requireCollector} from '@/lib/server/collector-identity';
import {ingestSuggestion} from '@/lib/server/source-review';
import {database} from '@/lib/server/runtime';
import {json,handle,readJsonBody} from '@/lib/server/http';
export const dynamic='force-dynamic';
export function POST(request:Request){return handle(async()=>{
 const run=await requireCollector(request);
 return json(await ingestSuggestion(database(),await readJsonBody(request),run));
});}
