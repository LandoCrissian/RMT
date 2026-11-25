import {requireControl} from '@/lib/server/control-access';
import {readArtworkUpload} from '@/lib/server/project-artwork';
import {validateArtworkImage} from '@/lib/project-artwork-validation';
import {handle,json} from '@/lib/server/http';
import {runtime} from '@/lib/server/runtime';
import {InputError} from '@/lib/submission-validation';
import {artworkPrefix} from '@/lib/homepage-art';

export async function POST(request:Request) {
  return handle(async()=>{
    await requireControl(request,'settings');
    const bucket=runtime().BUCKET;
    if(!bucket) throw new InputError('Image storage is unavailable.',503);
    const {bytes,mime}=await readArtworkUpload(request);
    const image=await validateArtworkImage(bytes,mime,'banner');
    if(image.width!==1200 || image.height!==630) throw new InputError('Choose a 1200 × 630 image.');
    const data=Uint8Array.from(image.bytes).buffer;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
    const file=digest+'.png';
    await bucket.put('homepage-art/'+file,data,{httpMetadata:{contentType:'image/png'}});
    return json({path:artworkPrefix+file},201);
  });
}
