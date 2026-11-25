"use client";

import {useEffect,useRef,useState} from "react";
import {readApiResponse,safeHttpsLink} from "./studio-shared";

type Provider = {
  request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;
  on?:(event:string,listener:()=>void)=>void;
  removeListener?:(event:string,listener:()=>void)=>void;
};
type Wallet={provider:Provider;id:string;name:string};
export type WalletContract={address:string;chainId:4663;source:string};
type Challenge={challengeId:string;claimId:string;message:string;address:string;contract:string;chainId:number;expiresAt:number};
const isAddress=(value:unknown):value is string=>typeof value==="string"&&/^0x[0-9a-fA-F]{40}$/.test(value);
const chainMatches=(value:unknown)=>typeof value==="string"&&/^0x[0-9a-f]+$/i.test(value)&&Number(value)===4663;

async function walletAddress(provider:Provider) {
  if(!chainMatches(await provider.request({method:"eth_chainId"})))throw Error("Select Robinhood Chain mainnet (4663) in your wallet, then try again.");
  const addresses=await provider.request({method:"eth_accounts"});
  if(!Array.isArray(addresses)||!isAddress(addresses[0]))throw Error("Unlock your wallet and choose the account that manages this contract.");
  return addresses[0];
}
async function post(account:string,body:Record<string,unknown>,signal:AbortSignal) {
  return readApiResponse(await fetch("/api/claims/wallet",{method:"POST",credentials:"same-origin",cache:"no-store",signal,
    headers:{"Content-Type":"application/json","X-RMT-Account":account},body:JSON.stringify(body)}));
}
function validateChallenge(data:Record<string,unknown>,address:string,contract:WalletContract):Challenge {
  if(typeof data.claimId!=="string"||typeof data.challengeId!=="string"||typeof data.message!=="string"||!data.message.trim()||
     data.message.length>8192||!isAddress(data.address)||data.address.toLowerCase()!==address.toLowerCase()||
     !isAddress(data.contract)||data.contract.toLowerCase()!==contract.address.toLowerCase()||data.chainId!==4663||
     typeof data.expiresAt!=="number"||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now())
    throw Error("RMT could not confirm the wallet, contract and expiry for this message. Prepare a fresh message.");
  return data as Challenge;
}
export default function WalletClaimProof({account,projectId,contract,onSubmitted,onManual}:{account:string;projectId:string;contract:WalletContract;onSubmitted:()=>void;onManual:()=>void}){
  const [wallets,setWallets]=useState<Wallet[]>([]),[selection,choose]=useState("");
  const [stage,setStage]=useState(""),[error,setError]=useState(""),[challenge,setChallenge]=useState<Challenge|null>(null);
  const selected=wallets.find(w=>w.id===selection)??wallets[0];
  const operation=useRef<AbortController|null>(null);
  useEffect(()=>{
    const add=(id:string,name:string,p:Provider|undefined)=>{
      if(!p||typeof p.request!=="function")return;
      setWallets(old=>old.some(w=>w.provider===p||w.id===id)?old:[...old,{id,name,provider:p}]);
    };
    const announce=(event:Event)=>{
      const d=(event as CustomEvent).detail;
      if(typeof d?.info?.uuid==="string"&&typeof d?.info?.name==="string")
        add(d.info.uuid,d.info.name.slice(0,64),d.provider);
    };
    window.addEventListener("eip6963:announceProvider",announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const legacy=()=>add("injected","Browser wallet",(window as Window&{ethereum?:Provider}).ethereum);
    legacy();window.addEventListener("ethereum#initialized",legacy);
    return ()=>{window.removeEventListener("eip6963:announceProvider",announce);window.removeEventListener("ethereum#initialized",legacy);operation.current?.abort();};
  },[]);
  useEffect(()=>{
    if(!challenge||!selected)return;
    const invalidate=()=>{operation.current?.abort();operation.current=null;setStage("");setChallenge(null);setError("Your wallet connection changed. Prepare a fresh message.");};
    const provider=selected.provider,events=["accountsChanged","chainChanged","disconnect"];
    for(const event of events)provider.on?.(event,invalidate);
    const timer=setTimeout(()=>{operation.current?.abort();operation.current=null;setStage("");setChallenge(null);setError("This message expired. Prepare a new one when you are ready.");},Math.max(0,challenge.expiresAt-Date.now()));
    return ()=>{clearTimeout(timer);for(const event of events)provider.removeListener?.(event,invalidate);};
  },[challenge,selected]);
  async function run() {
    if(!selected||operation.current)return;
    const controller=new AbortController();operation.current=controller;setError("");
    const check=()=>{if(controller.signal.aborted)throw Error("Cancelled.");};
    try{
      if(!challenge){
        setStage("Connecting wallet…");await selected.provider.request({method:"eth_requestAccounts"});check();
        const address=await walletAddress(selected.provider);check();setStage("Preparing your message…");
        const result=validateChallenge(await post(account,{action:"challenge",address,projectId},controller.signal),address,contract);
        check();if((await walletAddress(selected.provider)).toLowerCase()!==address.toLowerCase())throw Error("Your wallet changed. Prepare a new message.");
        check();setChallenge(result);
      }else{
        const validateWallet=async()=>{if((await walletAddress(selected.provider)).toLowerCase()!==challenge.address.toLowerCase())throw Error("Your wallet changed. Prepare a fresh message.");check();
          if(Date.now()>=challenge.expiresAt)throw Error("The message expired. Prepare a fresh message.");};
        setStage("Checking the selected wallet…");await validateWallet();
        const hex="0x"+Array.from(new TextEncoder().encode(challenge.message),b=>b.toString(16).padStart(2,"0")).join("");
        setStage("Review the message in your wallet…");
        const signature=await selected.provider.request({method:"personal_sign",params:[hex,challenge.address]});check();
        if(typeof signature!=="string"||!/^0x(?:[0-9a-f]{2})+$/i.test(signature))throw Error("The wallet returned an unsupported signature.");
        await validateWallet();setStage("Checking contract authority…");
        const result=await post(account,{action:"verify",challengeId:challenge.challengeId,signature},controller.signal);check();
        if(result.status!=="pending"||result.claimId!==challenge.claimId)throw Error("RMT could not confirm submission. Refresh your claims to check its status.");
        setChallenge(null);onSubmitted();
      }
    }catch(e){
      if(!controller.signal.aborted){
        setChallenge(null);
        setError((e as {code?:number})?.code===4001?"Wallet request cancelled. You can try again or use manual evidence.":e instanceof Error?e.message:"The wallet could not complete this request. Try again or use manual evidence.");
      }
    }finally{if(operation.current===controller){operation.current=null;setStage("");}}
  }
  return <section className="st-panel st-form" aria-label="Wallet verification">
    <h2>Verify with wallet</h2><p>Use the wallet that manages this contract. You’ll sign a message for this claim. There’s no transaction, gas fee or token approval.</p>
    <dl className="st-review-links"><div><dt>Robinhood Chain · 4663</dt><dd><code>{contract.address}</code></dd></div>{safeHttpsLink(contract.source)&&<div><dt>Contract source</dt><dd><a href={contract.source} target="_blank" rel="noopener noreferrer">View published contract reference</a></dd></div>}</dl>
    {wallets.length>0?<><label className="st-field">Wallet<select value={selected?.id??""} disabled={!!stage} onChange={e=>{choose(e.target.value);setChallenge(null);setError("");}}>{wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      {challenge&&<><p>Signing as <code>{challenge.address}</code></p><details><summary>Read the exact message</summary><pre>{challenge.message}</pre></details></>}
      <button type="button" disabled={!!stage} className="st-button st-primary" onClick={()=>void run()}>{stage||(challenge?"Sign ownership message":"Connect and prepare message")}</button></>:<p>Open this page in a compatible wallet browser, or enable a wallet extension on your computer.</p>}
    <span role="status" className="sr-only">{stage}</span>{error&&<p role="alert" className="st-error">{error}</p>}
    <button type="button" className="st-text-button" onClick={()=>{operation.current?.abort();operation.current=null;onManual();}}>Use manual evidence</button>
  </section>;
}
