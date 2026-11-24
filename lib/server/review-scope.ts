import {InputError} from '@/lib/submission-validation';
/** Existing open review tabs remain compatible; new tabs bind every mutation to their current account. */
export function reviewAccountScope(request:Request,userId:string){
  const expected=request.headers.get('x-rmt-account');
  if(expected!==null&&expected!==userId)throw new InputError('Your account changed. Reload the review workspace before continuing.',409,'account_changed');
}
