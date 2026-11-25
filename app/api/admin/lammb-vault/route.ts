import {database,requireAdmin} from '@/lib/server/runtime';
import {handle,json,readMutation} from '@/lib/server/http';
import {controlObject} from '@/lib/server/control-access';
import {InputError} from '@/lib/submission-validation';
import {importRoyalty,royaltySummary} from '@/lib/server/lammb-royalties';
import {configureTreasury,readTreasuryConfig} from '@/lib/server/lammb-treasury';
import {verifyLimit} from '@/lib/server/lammb-wallet';
export const dynamic='force-dynamic';
async function requireOwner(request:Request){
  const actor=await requireAdmin(request);
  if(actor.role!=='owner')throw new InputError('Vault management requires the RMT owner account.',403);
  return actor;
}
export function GET(request:Request) {
  return handle(async()=>{
    const owner=await requireOwner(request),db=database();
    const [treasury,summary]=await Promise.all([readTreasuryConfig(db),royaltySummary(db)]);
    return json({account:owner.userId,treasury,...summary});
  });
}
export function POST(request:Request) {
  return handle(async()=>{
    const owner=await requireOwner(request);
    if(request.headers.get('x-rmt-account')!==owner.userId)throw new InputError('Your RMT account changed. Reload before continuing.',409);
    const body=controlObject(await readMutation(request),['action','hash','address','revision']),db=database();
    if(body.action==='treasury'&&Object.keys(body).length===3&&Object.hasOwn(body,'address')&&Object.hasOwn(body,'revision')){
      return json({treasury:await configureTreasury(db,owner.userId,body.address,body.revision)});
    }
    if(body.action==='receipt'&&Object.keys(body).length===2&&Object.hasOwn(body,'hash')){
      await verifyLimit(db,'owner-royalty-import',30,60_000);
      return json(await importRoyalty(db,body.hash));
    }
    throw new InputError('Choose a valid Vault management action.');
  });
}
