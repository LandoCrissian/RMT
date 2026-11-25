const apexSubmission = 'a03d19b5-8cb0-47b6-97a8-23ecf5e5f194';

export function communitySlug(submissionId:string){
  return submissionId===apexSubmission?'apex-rising':'project-'+submissionId;
}

export function legacyProjectRedirect(request:Request){
  if(request.method!=='GET'&&request.method!=='HEAD')return null;
  const url=new URL(request.url);
  for(const prefix of ['/projects/','/media/share-card/']){
    if(url.pathname.replace(/\/$/,'')===prefix+'project-'+apexSubmission){
      url.pathname=prefix+communitySlug(apexSubmission);
      return new Response(null,{status:308,headers:{Location:url.toString()}});
    }
  }
  return null;
}
