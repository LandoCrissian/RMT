import { claimOptions } from '@/lib/server/claims';
import { database } from '@/lib/server/runtime';
import { handle,json } from '@/lib/server/http';
import { InputError } from '@/lib/submission-validation';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  const id=new URL(request.url).searchParams.get('projectId');
  if(!id||id.length>120)throw new InputError('Choose a project.');
  return json(await claimOptions(database(),id));
});}
