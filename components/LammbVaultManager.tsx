'use client';
import {useEffect,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import {ROBINHOOD_EXPLORER,formatUnits,type AssetTotals,type RoyaltyReceipt} from '@/lib/lammb-vault';
import {Amounts,VaultTop} from './LammbVault';

type Treasury={address:string|null;revision:number;updatedAt:number|null};
type ManagerState={account:string;treasury:Treasury;totals:AssetTotals;count:number};
const endpoint='/api/admin/lammb-vault';
async function call<T>(options:RequestInit={}):Promise<T>{
  const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store',...options});
  const result=await response.json().catch(()=>null) as ({error?:string}&T)|null;
  if(!response.ok||!result)throw Error(result?.error??'The owner console could not load.');
  return result as T;
}
export default function LammbVaultManager(){
  const [state,setState]=useState<ManagerState|null>(null),[address,setAddress]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [hash,setHash]=useState(''),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  async function load(signal?:AbortSignal){
    setError('');setLoading(true);
    try{const next=await call<ManagerState>({signal});if(!signal?.aborted){setState(next);setAddress(next.treasury.address??'');setConfirmed(false);}}
    catch(e){if(!signal?.aborted){setState(null);setError(e instanceof Error?e.message:'The console could not load.');}}
    finally{if(!signal?.aborted)setLoading(false);}
  }
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[]);
  const post=<T,>(body:object)=>call<T>({method:'POST',headers:{'Content-Type':'application/json','X-RMT-Account':state?.account??''},body:JSON.stringify(body)});
  async function setTreasury(value:string|null){
    if(!state||!confirmed||busy)return;
    setBusy('Saving…');setError('');setMessage('');
    try{
      const updated=await post<{treasury:Treasury}>({action:'treasury',address:value,revision:state.treasury.revision});
      setState(current=>current?{...current,treasury:updated.treasury}:current);
      setAddress(updated.treasury.address??'');setConfirmed(false);
      setMessage(value?'Address saved for tracking. No OpenSea setting or on-chain payout destination was changed.':'Tracking address removed. No funds were moved.');
    }catch(e){setError(e instanceof Error?e.message:'The tracking address could not be saved.');}
    finally{setBusy('');}
  }
  async function importReceipt(){
    if(!state||busy)return;
    setBusy('Verifying on-chain receipt…');setError('');setMessage('');
    try{
      const result=await post<{receipt:RoyaltyReceipt;added:boolean}>({action:'receipt',hash:hash.trim()});
      setHash('');
      const r=result.receipt;
      setMessage((result.added?'Verified and recorded ':'Already recorded ')+formatUnits(r.amount,r.asset)+' '+r.asset+' from Genesis #'+r.tokenId+'.');
      const next=await call<ManagerState>();
      setState(next);
    }catch(e){setError(e instanceof Error?e.message:'The receipt could not be recorded.');}
    finally{setBusy('');}
  }
  return <main className="lv-shell lv-manager">
    <VaultTop manage/>
    <header className="lv-gate-intro"><div className="lv-eyebrow"><span/> Owner only</div><h1>Vault owner console</h1>
      <p>Track the treasury address and record publicly verifiable royalty receipts. This console never requests a wallet transaction.</p></header>
    {loading&&<p role="status">Verifying owner access…</p>}
    {error&&<p role="alert" className="lv-error">{error}</p>}
    {message&&<p role="status" className="lv-notice">{message}</p>}
    {!loading&&!state&&<div className="lv-inline"><a className="lv-btn primary" href="/#account">Open RMT account</a><button className="lv-btn" onClick={()=>void load()}>Retry</button></div>}
    {state&&<div className="lv-manager-grid">
      <form className="lv-card" onSubmit={e=>{e.preventDefault();void setTreasury(address.trim());}}>
        <h2>Treasury tracking address</h2>
        <p>Use a dedicated Robinhood Chain wallet you control, ideally a multisig. Saving it here only tracks its balances. It does not redirect creator earnings.</p>
        {state.treasury.address&&<a className="lv-long" href={ROBINHOOD_EXPLORER+'/address/'+state.treasury.address} target="_blank" rel="noreferrer">{state.treasury.address}<ArrowUpRight size={14}/></a>}
        <label className="lv-field">Robinhood Chain address<input value={address} required maxLength={42} pattern="0x[0-9a-fA-F]{40}" spellCheck={false} autoCapitalize="none" onChange={e=>{setAddress(e.target.value);setConfirmed(false);}}/></label>
        <label className="lv-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I understand this changes tracking only.</label>
        <div className="lv-inline"><button className="lv-btn primary" type="submit" disabled={!confirmed||!address||Boolean(busy)}>Save tracking address</button>
        {state.treasury.address&&<button className="lv-btn" type="button" disabled={!confirmed||Boolean(busy)} onClick={()=>void setTreasury(null)}>Clear</button>}</div>
        <a href="https://support.opensea.io/en/articles/8867026-how-do-i-set-creator-earnings-on-opensea" target="_blank" rel="noreferrer">OpenSea creator earnings instructions <ArrowUpRight size={14}/></a>
      </form>
      <form className="lv-card" onSubmit={e=>{e.preventDefault();void importReceipt();}}>
        <h2>Import a royalty receipt</h2>
        <p>Paste a finalized Robinhood Chain Seaport 1.6 transaction. The Vault records a single Genesis sale only when the creator’s recipient and payment can be independently matched on-chain.</p>
        <label className="lv-field">Transaction hash<input value={hash} required maxLength={66} pattern="0x[0-9a-fA-F]{64}" spellCheck={false} autoCapitalize="none" onChange={e=>setHash(e.target.value)}/></label>
        <button className="lv-btn primary" type="submit" disabled={!hash||Boolean(busy)}>Verify &amp; import</button>
        <p>{state.count} verified {state.count===1?'receipt':'receipts'}</p>
        <Amounts totals={state.totals} empty="No receipts have been logged."/>
      </form>
    </div>}
    {busy&&<p role="status">{busy}</p>}
  </main>;
}
