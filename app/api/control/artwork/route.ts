import {InputError} from '@/lib/submission-validation';
import {requireControl,controlQuery} from '@/lib/server/control-access';
import {assertControlArtworkProject,controlArtworkList,uploadControlArtwork} from '@/lib/server/control-artwork';
import {readArtworkUpload} from '@/lib/server/project-artwork';
import {database,runtime} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{const actor=await requireControl(request,'projects'),query=controlQuery(request,['projectId']);return json({artwork:await controlArtworkList(database(),actor,query.get('projectId')??'')});});}
export async function POST(request:Request){return handle(async()=>{
 const actor=await requireControl(request,'projects'),query=controlQuery(request,['projectId','kind']),projectId=query.get('projectId')??'',kind=query.get('kind');
 if(kind!=='logo'&&kind!=='banner')throw new InputError('Choose a logo or banner image.');
 const db=database();await assertControlArtworkProject(db,actor,projectId);const bucket=runtime().BUCKET;
 if(!bucket)throw new InputError('Artwork uploads are temporarily unavailable.',503);
 const {bytes,mime}=await readArtworkUpload(request);return json({artwork:await uploadControlArtwork(db,bucket,actor,projectId,kind,bytes,mime)},201);
});}
