import { validateProjectEdit } from '@/lib/submission-validation';
import { createProjectEdit,ownProjectEdits } from '@/lib/server/project-edits';
import { database,requireIdentity,runtime } from '@/lib/server/runtime';
import { dispatchNotifications } from '@/lib/server/notifications';
import { handle,json,readMutation } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const user=await requireIdentity(request);return json({edits:await ownProjectEdits(database(),user.userId)});});}
export async function POST(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),input=validateProjectEdit(await readMutation(request)),db=database();
  const edit=await createProjectEdit(db,user,input);
  await dispatchNotifications(db,runtime());
  return json({edit},201);
});}
