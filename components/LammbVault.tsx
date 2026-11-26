'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowLeft,ArrowUpRight,Check,LockKeyhole,ShieldCheck,Wallet} from 'lucide-react';
import {ASSETS,GENESIS_CONTRACT,GENESIS_OPENSEA,ROBINHOOD_CHAIN_ID,ROBINHOOD_EXPLORER,
  ROBINHOOD_RPC,VAULT_MINIMUM,VAULT_PATH,formatUnits,type Asset,type AssetTotals,type MiningStatus,type VaultMember,type VaultPublic} from '@/lib/lammb-vault';
import {MONEY_LAB_PATH} from '@/lib/lammb-money-lab';
import './lammb-vault.css';

type Provider={request:(options:{method:string;params?:unknown[]})=>Promise<unknown>;
  on?:(event:string,callback:()=>void)=>void;removeListener?:(event:string,callback:()=>void)=>void;};
type WalletChoice={id:string;name:string;provider:Provider};
type Challenge={challengeId:string;address:string;chainId:number;message:string;expiresAt:number};
const api='/api/lammb-vault';
const addressOk=(address:unknown):address is string=>typeof address==='string'&&/^0x[\da-f]{40}$/i.test(address);
const short=(s:string)=>s.slice(0,8)+'…'+s.slice(-6);
const chainId='0x'+ROBINHOOD_CHAIN_ID.toString(16);
class VaultError extends Error{constructor(message:string,public status:number){super(message);}}
async function request<T>(query='',body?:object,signal?:AbortSignal):Promise<T>{
  const response=await fetch(api+query,{credentials:'same-origin',cache:'no-store',signal,
    ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const value=await response.json().catch(()=>null) as ({error?:string}&T)|null;
  if(!response.ok||!value)throw new VaultError(value?.error??'The Vault could not load. Try again.',response.status);
  return value as T;
}
async function onChain(provider:Provider){
  const active=await provider.request({method:'eth_chainId'});
  return typeof active==='string'&&Number(active)===ROBINHOOD_CHAIN_ID;
}
async function account(provider:Provider){
  if(!await onChain(provider))throw Error('Switch your wallet to Robinhood Chain mainnet.');
  const addresses=await provider.request({method:'eth_accounts'});
  if(!Array.isArray(addresses)||!addressOk(addresses[0]))throw Error('Unlock your wallet and choose the account that holds your Genesis NFTs.');
  return addresses[0].toLowerCase();
}
export function VaultTop({manage=false}:{manage?:boolean}){
  return <div className="lv-top">
    <a className="lv-brand" href="/">RMT<span>.</span></a>
    <a href={manage?VAULT_PATH:'/projects/lammbs'}><ArrowLeft size={16}/>{manage?'Back to the Vault':'Back to LAMMBs'}</a>
  </div>;
}
export function Amounts({totals,empty}:{totals:AssetTotals;empty:string}){
  const present=(Object.keys(ASSETS) as Asset[]).filter(asset=>totals[asset]!==undefined);
  return present.length?<ul className="lv-amounts">{present.map(asset=><li key={asset}><strong>{formatUnits(totals[asset]!,asset)}</strong> <span>{asset}</span></li>)}</ul>:<p className="lv-empty">{empty}</p>;
}
export function MiningActivity({mining}:{mining:MiningStatus}){
  if(mining.status!=='reported')return <div><p className="lv-empty">{mining.status==='unconfigured'?'No LAMMB mining account connected.':'Mining data is temporarily unavailable.'}</p>
    <p>No hashrate or earnings are reported until RMT receives data from the LAMMB mining account.</p></div>;
  const hashrate=new Intl.NumberFormat('en-US',{maximumSignificantDigits:4});
  return <div>
    <ul className="lv-amounts">
      <li><strong>{hashrate.format(mining.hashrate1hTH)} TH/s</strong> <span>1-hour average</span></li>
      <li><strong>{hashrate.format(mining.hashrate24hTH)} TH/s</strong> <span>24-hour average</span></li>
      <li><strong>{mining.workersOk}</strong> <span>healthy workers reported</span></li>
      <li><strong>{mining.cumulativePoolRewardBTC} BTC</strong> <span>lifetime pool reward</span></li>
    </ul>
    <p>{mining.provider} · Checked {new Date(mining.checkedAt).toISOString().slice(0,16).replace('T',' ')} UTC. Pool rewards are not verified wallet payouts or net profit.</p>
  </div>;
}
export default function LammbVault(){
  const [overview,setOverview]=useState<VaultPublic|null>(null);
  const [publicState,setPublicState]=useState<'loading'|'ready'|'error'>('loading');
  const [wallets,setWallets]=useState<WalletChoice[]>([]),[walletId,setWalletId]=useState('');
  const [challenge,setChallenge]=useState<Challenge|null>(null),[member,setMember]=useState<VaultMember|null>(null);
  const [stage,setStage]=useState(''),[error,setError]=useState('');
  const pending=useRef<AbortController|null>(null),epoch=useRef(0);
  const wallet=wallets.find(w=>w.id===walletId)??wallets[0];
  const refreshOverview=(signal?:AbortSignal)=>{
    setPublicState('loading');
    return request<VaultPublic>('',undefined,signal).then(data=>{setOverview(data);setPublicState('ready');})
      .catch(()=>{if(!signal?.aborted)setPublicState('error');});
  };
  useEffect(()=>{
    const controller=new AbortController();
    void refreshOverview(controller.signal);
    const add=(id:string,name:string,provider:Provider|undefined)=>{
      if(!provider||typeof provider.request!=='function')return;
      setWallets(old=>{
        const previous=old.find(w=>w.provider===provider);
        if(previous&&previous.id==='injected'&&id!=='injected')return old.map(w=>w===previous?{id,name,provider}:w);
        if(previous||old.some(w=>w.id===id))return old;
        return [...old,{id,name,provider}];
      });
    };
    const announce=(e:Event)=>{
      const d=(e as CustomEvent).detail;
      if(typeof d?.info?.uuid==='string'&&typeof d?.info?.name==='string')add(d.info.uuid,d.info.name.slice(0,64),d.provider);
    };
    const legacy=()=>add('injected','Browser wallet',(window as Window&{ethereum?:Provider}).ethereum);
    window.addEventListener('eip6963:announceProvider',announce);
    window.addEventListener('ethereum#initialized',legacy);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    legacy();
    return ()=>{controller.abort();pending.current?.abort();epoch.current++;window.removeEventListener('eip6963:announceProvider',announce);window.removeEventListener('ethereum#initialized',legacy);};
  },[]);
  function reset(reason=''){
    epoch.current++;pending.current?.abort();pending.current=null;
    setChallenge(null);setMember(null);setStage('');setError(reason);
    return request('',{action:'disconnect'}).catch(()=>{});
  }
  const provider=wallet?.provider,verified=Boolean(challenge||member),sessionActive=member?.eligible===true;
  useEffect(()=>{
    if(!provider||!verified)return;
    const events=['accountsChanged','chainChanged','disconnect'];
    const changed=()=>{void reset('Your wallet connection changed. Verify the new connection to continue.');};
    for(const event of events)provider.on?.(event,changed);
    return ()=>{for(const event of events)provider.removeListener?.(event,changed);};
  },[provider,verified]);
  useEffect(()=>{
    if(!challenge)return;
    const timer=setTimeout(()=>{
      epoch.current++;pending.current?.abort();pending.current=null;
      setChallenge(null);setStage('');setError('This message expired. Connect again to prepare a new one.');
    },Math.max(0,challenge.expiresAt-Date.now()));
    return ()=>clearTimeout(timer);
  },[challenge]);

  useEffect(()=>{
    if(!provider||verified)return;
    // Restore only when the injected wallet still exposes the session's account and network.
    const controller=new AbortController(),sequence=epoch.current;
    void (async()=>{
      try {
        const address=await account(provider);
        if(controller.signal.aborted||sequence!==epoch.current)return;
        const result=await request<VaultMember>('?view=member',undefined,controller.signal);
        if(!controller.signal.aborted&&sequence===epoch.current&&!pending.current&&result.address===address)setMember(result);
      }catch{/* No prior session is an ordinary locked state. */}
    })();
    return ()=>controller.abort();
  },[provider,verified]);
  useEffect(()=>{
    if(!sessionActive||!provider)return;
    const controller=new AbortController(),sequence=epoch.current;
    let inFlight=false;
    const check=async()=>{
      if(inFlight||document.hidden)return;
      inFlight=true;
      try{
        const address=await account(provider);
        if(address!==member?.address){if(!controller.signal.aborted&&sequence===epoch.current)void reset('Your wallet connection changed. Verify it again.');return;}
        const result=await request<VaultMember>('?view=member',undefined,controller.signal);
        if(!controller.signal.aborted&&sequence===epoch.current){setError('');setMember(result);}
      }catch(e){
        if(!controller.signal.aborted&&sequence===epoch.current) {
          setMember(null);setError(e instanceof Error?e.message:'Your access could not be rechecked. Verify your wallet again.');
        }
      }finally{inFlight=false;}
    };
    const timer=setInterval(()=>void check(),45_000);
    const visibility=()=>{if(!document.hidden)void check();};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visibility);};
  },[sessionActive,provider,member?.address]);

  async function connect(){
    if(!wallet||pending.current)return;
    const controller=new AbortController(),p=wallet.provider;
    pending.current=controller;setError('');
    const guard=()=>{if(controller.signal.aborted)throw Error('Wallet request cancelled.');};
    try{
      if(!challenge){
        setMember(null);setStage('Connecting wallet…');
        await p.request({method:'eth_requestAccounts'});guard();
        if(!await onChain(p)){
          try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
          catch(e){
            if(Number((e as {code?:number})?.code)!==4902)throw e;
            await p.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:'Robinhood Chain',
              nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[ROBINHOOD_RPC],blockExplorerUrls:[ROBINHOOD_EXPLORER]}]});
            guard();
            if(!await onChain(p))await p.request({method:'wallet_switchEthereumChain',params:[{chainId}]});
          }
        }
        guard();
        const address=await account(p);guard();setStage('Preparing verification…');
        const next=await request<Challenge>('',{action:'challenge',address},controller.signal);
        if(next.chainId!==ROBINHOOD_CHAIN_ID||next.address.toLowerCase()!==address||next.expiresAt<=Date.now()||
          (await account(p))!==address)throw Error('Your wallet changed. Connect again.');
        guard();setChallenge(next);
      }else{
        const address=await account(p);guard();
        if(address!==challenge.address.toLowerCase()||challenge.expiresAt<=Date.now())throw Error('Your wallet or signature request changed. Connect again.');
        setStage('Review the message in your wallet…');
        const message='0x'+Array.from(new TextEncoder().encode(challenge.message),b=>b.toString(16).padStart(2,'0')).join('');
        const signature=await p.request({method:'personal_sign',params:[message,challenge.address]});guard();
        if(typeof signature!=='string'||!/^0x(?:[\da-f]{2})+$/i.test(signature))throw Error('Your wallet did not return a supported signature.');
        if(await account(p)!==address)throw Error('Your wallet account changed. Connect again.');
        guard();setStage('Checking live holdings…');
        let result=await request<VaultMember>('',{action:'verify',challengeId:challenge.challengeId,signature},controller.signal);
        guard();
        if(result.eligible)result=await request<VaultMember>('?view=member',undefined,controller.signal);
        guard();setChallenge(null);setMember(result);
      }
    }catch(e){
      if(!controller.signal.aborted){setChallenge(null);setError(Number((e as {code?:number})?.code)===4001?
        'Wallet request cancelled. Nothing was sent.':e instanceof Error?e.message:'Your wallet could not complete the request.');}
    }finally{if(pending.current===controller){pending.current=null;setStage('');}}
  }
  const routed=Boolean(overview?.treasury&&overview.royalty?.receiver===overview.treasury.address);
  const source=ROBINHOOD_EXPLORER+'/token/'+GENESIS_CONTRACT;
  return <main className="lv-shell">
    <VaultTop/>
    <header className="lv-hero">
      <div className="lv-herocopy">
        <div className="lv-eyebrow"><span/> RMT × LAMMBs Genesis</div>
        <h1>LAMMB <em>Vault.</em></h1>
        <p>Follow the creator royalties. Open the detailed ledger with five Genesis NFTs in one wallet.</p>
        <div className="lv-hero-actions"><a className="lv-btn primary" href="#wallet-access"><LockKeyhole size={17}/> Holder access</a><a className="lv-btn" href="#treasury"><ArrowDown size={17}/> Public treasury</a><a className="lv-btn" href={MONEY_LAB_PATH}><ArrowUpRight size={17}/> Open Money Lab</a></div>
      </div>
      <div className="lv-seal" aria-hidden="true"><span>GENESIS</span><strong>5<em>+</em></strong><span>WALLET ACCESS</span></div>
    </header>

    <section id="wallet-access" className="lv-gate" aria-labelledby="lv-gate-title">
      <div className="lv-gate-intro">
        <div className="lv-eyebrow"><span/> Holder access</div>
        <h2 id="lv-gate-title">One wallet. Five LAMMBs.</h2>
        <p>Verify your Genesis holdings on Robinhood Chain. Your signature is free and cannot move or approve tokens.</p>
        <a href={GENESIS_OPENSEA} target="_blank" rel="noreferrer">View Genesis on OpenSea <ArrowUpRight size={14}/></a>
      </div>
      <div className="lv-gate-action">
        {member?<><div className={'lv-status '+(member.eligible?'good':'')}><span/>{member.eligible?'Access verified':'Vault locked'}</div>
          <strong className="lv-count">{member.balance} <small>/ {VAULT_MINIMUM} LAMMBs</small></strong>
          <p><code>{short(member.address)}</code>{!member.eligible&&<> · {Math.max(0,VAULT_MINIMUM-member.balance)} more in this wallet to unlock.</>}</p>
          <div className="lv-inline">{!member.eligible&&<button className="lv-btn primary" onClick={()=>void connect()} disabled={!wallet||Boolean(stage)}>{stage||'Check again'}</button>}
          <button className="lv-btn" onClick={()=>void reset()}>Disconnect</button></div></>:
          <>
            {wallets.length>0?<><label className="lv-field">Wallet
              <select value={wallet?.id??''} onChange={e=>{setWalletId(e.target.value);void reset();}} disabled={Boolean(stage)}>
                {wallets.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
              {challenge&&<details><summary>Review the exact message</summary><pre>{challenge.message}</pre></details>}
              <button className="lv-btn primary" type="button" disabled={Boolean(stage)} onClick={()=>void connect()}><Wallet size={17}/>{stage||(challenge?'Sign to verify':'Connect wallet')}</button></>:
              <><div className="lv-status"><span/> Wallet not detected</div><p>On your phone, open this Vault URL in your wallet’s web3 browser. On desktop, use a compatible browser extension.</p>
              <a href="https://robinhood.com/us/en/support/articles/connect-to-dapps/" target="_blank" rel="noreferrer">Robinhood Wallet setup <ArrowUpRight size={14}/></a></>}
          </>}
        {error&&<p role="alert" className="lv-error">{error}</p>}
        <span className="sr-only" role="status">{stage}</span>
      </div>
    </section>

    {member?.eligible&&member.member&&<section className="lv-member" aria-labelledby="lv-member-title">
      <div className="lv-eyebrow"><ShieldCheck size={17}/> Verified holders</div>
      <h2 id="lv-member-title">Inside the Vault</h2>
      <p>Holdings checked at Robinhood Chain block {member.block.toLocaleString()}. Access follows the NFTs if they leave your wallet.</p>
      <div className="lv-member-grid">
        <article className="lv-card"><h3>Received by the treasury</h3><Amounts totals={member.member.treasuryReceipts} empty="No verified receipts to a configured treasury."/>
          <p>Only separately identified royalty payments logged to the configured address. This is not the wallet balance.</p></article>
        <article className="lv-card"><h3>Mining activity</h3><MiningActivity mining={member.member.mining??{status:'unconfigured'}}/></article>
      </div>
      <div className="lv-ledger">
        <h3>Latest verified royalty receipts</h3>
        {member.member.receipts.length?<ul>{member.member.receipts.map(row=><li key={row.hash}><div><strong>Genesis #{row.tokenId}</strong><small>{new Date(row.timestamp*1000).toISOString().slice(0,10)} UTC · {short(row.recipient)}</small></div><strong>{formatUnits(row.amount,row.asset)} {row.asset}</strong><a href={ROBINHOOD_EXPLORER+'/tx/'+row.hash} target="_blank" rel="noreferrer">View proof <ArrowUpRight size={14}/></a></li>)}</ul>:
          <p>No supported sales have been imported. Absence from the ledger does not mean no creator earnings were received.</p>}
      </div>
    </section>}

    <section className="lv-public" id="treasury" aria-labelledby="lv-treasury-title">
      <div className="lv-eyebrow"><span/> Public treasury</div>
      <h2 id="lv-treasury-title">Follow the royalties.</h2>
      <p>On-chain observations and verified receipts, shown separately from project plans.</p>
      <div className="lv-public-grid">
        <article className="lv-card"><h3>On-chain royalty setting</h3>
          {overview?.royalty?<><strong className="lv-metric">{overview.royalty.rateBps/100}%</strong>
            <a className="lv-long" href={ROBINHOOD_EXPLORER+'/address/'+overview.royalty.receiver} target="_blank" rel="noreferrer">{overview.royalty.receiver}<ArrowUpRight size={14}/></a>
            <p>ERC-2981 sample of #{overview.royalty.sampleIds.join(', #')} at block {overview.royalty.block.toLocaleString()}. Marketplace payout settings and enforcement may differ.</p></>:
            <p className="lv-empty">{publicState==='loading'?'Checking Robinhood Chain…':'No uniform royalty setting verified in the latest check.'}</p>}
        </article>
        <article className="lv-card"><h3>Dedicated treasury</h3>
          {overview?.treasury?<><div className={'lv-status '+(routed?'good':'')}><span/>{routed?'Matches sampled on-chain recipient':'Payout routing not verified'}</div>
            <a className="lv-long" href={ROBINHOOD_EXPLORER+'/address/'+overview.treasury.address} target="_blank" rel="noreferrer">{overview.treasury.address}<ArrowUpRight size={14}/></a>
            <Amounts totals={overview.treasury.balances} empty="Live balances unavailable."/>
            <p>{overview.treasury.block?'Balances at block '+overview.treasury.block.toLocaleString()+'. ':''}Balances may include funds unrelated to royalties.</p></>:
            <p className="lv-empty">{overview?'No dedicated wallet configured. RMT does not receive or route royalties.':publicState==='loading'?'Checking treasury setup…':'Treasury status unavailable.'}</p>}
        </article>
        <article className="lv-card"><h3>Royalties tracked</h3>
          <Amounts totals={overview?.tracked??{}} empty={overview?'No verified receipts logged.':publicState==='loading'?'Loading receipts…':'Receipt totals unavailable.'}/>
          {overview&&<p>{overview.count} verified {overview.count===1?'receipt':'receipts'} across recipient addresses. This ledger is not a complete sales history.</p>}
        </article>
      </div>
      {publicState==='error'&&<button className="lv-btn" onClick={()=>void refreshOverview()}>Retry treasury check</button>}
    </section>
    <section className="lv-plan" aria-labelledby="lv-plan-title">
      <div><div className="lv-eyebrow"><span/> Project treasury</div><h2 id="lv-plan-title">How funds are handled.</h2></div>
      <p>The treasury and any future mining expenses are controlled outside RMT. No automatic royalty split or holder payouts are active.</p>
    </section>
    <footer className="lv-footer"><a href={source} target="_blank" rel="noreferrer">Genesis contract <ArrowUpRight size={14}/></a>
      <a href={VAULT_PATH+'/manage'}>Owner console <Check size={14}/></a></footer>
  </main>;
}
