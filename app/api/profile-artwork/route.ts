import {validateProfileArtworkKind} from '@/lib/profiles';
import {InputError} from '@/lib/submission-validation';
import {ownProfileArtwork,readProfileArtworkUpload,uploadProfileArtwork} from '@/lib/server/profile-artwork';
import {profileAccountConflict} from '@/lib/server/profiles';
import {database,requireIdentity,runtime} from '@/lib/server/runtime';
import {handle,json} from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=profileAccountConflict(request,user.userId);
  if(conflict)return conflict;
  if(new URL(request.url).search)throw new InputError('This image list takes no query parameters.');
  return json({artwork:await ownProfileArtwork(database(),user.userId)});
});}
export async function POST(request:Request){return handle(async()=>{
  const user=await requireIdentity(request),conflict=profileAccountConflict(request,user.userId);
  if(conflict)return conflict;
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(key=>key!=='kind')||query.getAll('kind').length!==1)throw new InputError('Choose one profile image type.');
  const kind=validateProfileArtworkKind(query.get('kind')),bucket=runtime().BUCKET;
  if(!bucket)throw new InputError('Profile images are temporarily unavailable.',503);
  const {bytes,mime}=await readProfileArtworkUpload(request);
  return json({artwork:await uploadProfileArtwork(database(),bucket,user,kind,bytes,mime)},201);
});}
