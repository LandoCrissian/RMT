const select=document.querySelector('select'),button=document.querySelector('button'),status=document.querySelector('output');
const wallets=new Map(),events=['accountsChanged','chainChanged','disconnect'];
let provider,revision=0;
function changed(){revision++;button.disabled=!provider;status.textContent='Wallet connection changed. Reconnect to check your account and network.';}
function choose(){
 for(const event of events)provider?.removeListener?.(event,changed);
 provider=wallets.get(select.value);changed();
 for(const event of events)provider?.on?.(event,changed);
 status.textContent='Ready to connect.';
}
function add(id,name,p){
 if(!p||typeof p.request!=='function'||wallets.has(id)||[...wallets.values()].includes(p))return;
 wallets.set(id,p);select.add(new Option(String(name).slice(0,60),id));
 if(!provider)choose();
}
window.addEventListener('eip6963:announceProvider',e=>{if(typeof e.detail?.info?.uuid==='string')add(e.detail.info.uuid,e.detail.info.name,e.detail.provider);});
window.dispatchEvent(new Event('eip6963:requestProvider'));
setTimeout(()=>{if(!wallets.size)add('legacy','Injected wallet',window.ethereum);if(!wallets.size)status.textContent='Open this page in a wallet browser or enable a wallet extension.';},350);
select.onchange=choose;
button.onclick=async()=>{
 const selected=provider,attempt=revision;button.disabled=true;
 try {
  await selected.request({method:'eth_requestAccounts'});if(revision!==attempt)return;
  const accounts=await selected.request({method:'eth_accounts'}),chain=await selected.request({method:'eth_chainId'});
  if(revision!==attempt)return;
  if(!Array.isArray(accounts)||!/^0x[0-9a-f]{40}$/i.test(accounts[0]))throw Error('disconnected');
  status.textContent=BigInt(chain)===4663n?accounts[0].slice(0,6)+'…'+accounts[0].slice(-4)+' · Robinhood Chain mainnet':'Select Robinhood Chain (4663) in your wallet, then reconnect.';
 }catch(e){if(attempt===revision)status.textContent=e.code===4001?'Connection cancelled. You can retry.':'Wallet unavailable. Unlock your wallet and reconnect.';}
 finally{if(attempt===revision)button.disabled=false;}
};
