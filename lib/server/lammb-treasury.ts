import type {VaultPublic} from '../lammb-vault';
import {InputError} from '../submission-validation';
import {currentTreasury,isAddress} from './lammb-rpc';
import {royaltySummary} from './lammb-royalties';

export type TreasuryConfig={address:string|null;revision:number;updatedAt:number|null};
export async function readTreasuryConfig(db:D1Database):Promise<TreasuryConfig>{
  return await db.prepare('SELECT address,revision,updated_at AS updatedAt FROM lammb_vault_treasury WHERE id=1')
    .first<TreasuryConfig>()??{address:null,revision:0,updatedAt:null};
}
export async function configureTreasury(db:D1Database,actor:string,value:unknown,revision:unknown) {
  if(value!==null&&!isAddress(value))throw new InputError('Enter a valid Robinhood Chain treasury address.');
  if(typeof revision!=='number'||!Number.isSafeInteger(revision)||revision<0)throw new InputError('Refresh before updating the treasury.');
  const address=value?.toLowerCase()??null,now=Date.now();
  const result= revision===0
    ? await db.prepare(`INSERT INTO lammb_vault_treasury(id,address,revision,updated_at,updated_by) VALUES(1,?,1,?,?)
       ON CONFLICT(id) DO NOTHING`).bind(address,now,actor).run()
    : await db.prepare(`UPDATE lammb_vault_treasury SET address=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=1 AND revision=?`)
      .bind(address,now,actor,revision).run();
  if(result.meta.changes!==1)throw new InputError('The treasury setting changed. Refresh before saving.',409);
  return {address,revision:revision+1,updatedAt:now};
}
type TreasuryObservation=Awaited<ReturnType<typeof currentTreasury>>;
let observed:{address:string|null;until:number;value:TreasuryObservation}|null=null;
async function observe(address:string|null){
  if(observed?.address===address&&observed.until>Date.now())return observed.value;
  const value=await currentTreasury(address);
  observed={address,until:Date.now()+45_000,value};
  return value;
}
export async function publicVault(db:D1Database):Promise<VaultPublic>{
  const [{address},tracked]=await Promise.all([readTreasuryConfig(db),royaltySummary(db)]);
  const current=await observe(address).catch(()=>({royalty:null,treasury:address?{address,block:null,balances:{}}:null}));
  return {...current,tracked:tracked.totals,count:tracked.count};
}
