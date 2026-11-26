import {GENESIS_CONTRACT, ROBINHOOD_CHAIN_ID, VAULT_MINIMUM, VAULT_PATH} from '../lammb-vault';
import {InputError} from '../submission-validation';
import {genesisBalance, isAddress, tag, vaultChain} from './lammb-rpc';
import {checksumAddress,vaultSignaturePattern,verifyVaultSignature} from './lammb-signature';

const CHALLENGE_AGE=5*60_000,SESSION_AGE=60*60_000;
export const COOKIE_AGE=SESSION_AGE/1000;
export const BROWSER_COOKIE='__Host-rmt-lammb-browser';
export const SESSION_COOKIE='__Host-rmt-lammb-session';
export const TOKEN_RE=/^[0-9a-f]{64}$/;
export function vaultToken(){
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function tokenHash(namespace:string,token:string){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(namespace+'\n'+token));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
type Context={db:D1Database;origin:string;browser:string};
type WalletRow={browser_hash:string;challenge_id:string;origin:string;address:string;issued_at:number;
  expires_at:number;used_at:number|null;session_hash:string|null;};
const expired=()=>new InputError('Your wallet session expired. Reconnect and sign a fresh message.',401,'wallet_session_expired');
const unavailable=()=>new InputError('That message expired, was used, or was issued in a different browser. Request a new one.',409);

function message(origin:string,address:string,challengeId:string,issuedAt:number){
  return [
    new URL(origin).host+' wants you to sign in with your Ethereum account:',
    address,'','Verify access to the RMT LAMMB Vault. No transaction, token approval or fee.', '',
    'URI: '+origin+VAULT_PATH,'Version: 1','Chain ID: '+ROBINHOOD_CHAIN_ID,'Nonce: '+challengeId,
    'Issued At: '+new Date(issuedAt).toISOString(),'Expiration Time: '+new Date(issuedAt+SESSION_AGE).toISOString(),
    'Resources:','- eip155:'+ROBINHOOD_CHAIN_ID+'/erc721:'+GENESIS_CONTRACT,
  ].join('\n');
}
export async function verifyLimit(db:D1Database,key:string,cap:number,windowMs:number,now=Date.now()){
  const expires=(Math.floor(now/windowMs)+1)*windowMs;
  const result=await db.prepare(`INSERT INTO lammb_vault_limits(key,expires_at,count) VALUES(?,?,1)
    ON CONFLICT(key) DO UPDATE SET count=lammb_vault_limits.count+1 WHERE lammb_vault_limits.count<?`)
    .bind(key+':'+expires,expires,cap).run();
  if(result.meta.changes!==1)throw new InputError('Too many checks. Wait a minute and try again.',429);
}
export async function issueVaultChallenge(ctx:Context,address:unknown,source:string){
  if(!isAddress(address))throw new InputError('Choose a valid wallet address.');
  const walletAddress=checksumAddress(address);
  const {db,origin,browser}=ctx,now=Date.now(),expiresAt=now+CHALLENGE_AGE,challengeId=vaultToken();
  const browserHash=await tokenHash('browser',browser);
  await verifyLimit(db,'browser:'+browserHash,10,60_000,now);
  if(source)await verifyLimit(db,'network:'+await tokenHash('network',source),40,60_000,now);
  await verifyLimit(db,'challenge-global',1000,60_000,now);
  await db.batch([
    db.prepare('DELETE FROM lammb_vault_wallets WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM lammb_vault_limits WHERE expires_at<=?').bind(now),
    db.prepare(`INSERT INTO lammb_vault_wallets(browser_hash,challenge_id,origin,address,issued_at,expires_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(browser_hash) DO UPDATE SET challenge_id=excluded.challenge_id,origin=excluded.origin,
      address=excluded.address,issued_at=excluded.issued_at,expires_at=excluded.expires_at,used_at=NULL,session_hash=NULL`)
      .bind(browserHash,challengeId,origin,walletAddress,now,expiresAt),
  ]);
  return {challengeId,address:walletAddress,chainId:ROBINHOOD_CHAIN_ID,expiresAt,message:message(origin,walletAddress,challengeId,now)};
}
export async function confirmVaultWallet(ctx:Context,challengeId:unknown,signature:unknown) {
  if(typeof challengeId!=='string'||!TOKEN_RE.test(challengeId)||
    typeof signature!=='string'||!vaultSignaturePattern.test(signature))throw new InputError('The wallet response is incomplete.');
  const {db,origin,browser}=ctx,browserHash=await tokenHash('browser',browser),now=Date.now();
  const row=await db.prepare(`SELECT * FROM lammb_vault_wallets WHERE browser_hash=? AND origin=? AND challenge_id=? AND expires_at>? AND used_at IS NULL`)
    .bind(browserHash,origin,challengeId,now).first<WalletRow>();
  if(!row)throw unavailable();
  const spent=await db.prepare(`UPDATE lammb_vault_wallets SET used_at=? WHERE browser_hash=? AND origin=? AND challenge_id=?
    AND expires_at>? AND used_at IS NULL`).bind(now,browserHash,origin,challengeId,now).run();
  if(spent.meta.changes!==1)throw unavailable();
  const address=row.address.toLowerCase();
  const ownership=await vaultChain(async(rpc,head)=>{
    const at=tag(head.number);
    const signed=await verifyVaultSignature(rpc,address,message(origin,row.address,challengeId,row.issued_at),signature,at);
    if(!signed)throw new InputError('The signature does not match this wallet and this Vault request.',422);
    return {balance:await genesisBalance(rpc,address,at),block:head.number};
  });
  const checkedAt=Date.now(),eligible=ownership.balance>=VAULT_MINIMUM;
  const result={address,...ownership,eligible,checkedAt};
  if(!eligible)return {result,session:null};
  const session=vaultToken(),hash=await tokenHash('session',session);
  const grant=await db.prepare(`UPDATE lammb_vault_wallets SET session_hash=?,expires_at=? WHERE browser_hash=?
    AND origin=? AND challenge_id=? AND used_at=? AND expires_at>? AND session_hash IS NULL`)
    .bind(hash,row.issued_at+SESSION_AGE,browserHash,origin,challengeId,now,checkedAt).run();
  if(grant.meta.changes!==1)throw unavailable();
  return {result,session};
}

export async function withVaultMember<T>(ctx:Context,session:string,load:()=>Promise<T>){
  const {db,browser,origin}=ctx;
  const [browserHash,sessionHash]=await Promise.all([tokenHash('browser',browser),tokenHash('session',session)]);
  const lookup=()=>db.prepare('SELECT address FROM lammb_vault_wallets WHERE browser_hash=? AND origin=? AND session_hash=? AND expires_at>?')
    .bind(browserHash,origin,sessionHash,Date.now()).first<{address:string}>();
  const row=await lookup();
  if(!row)throw expired();
  await verifyLimit(db,'member:'+sessionHash,18,60_000);
  const ownership=await vaultChain(async(rpc,head)=>({
    balance:await genesisBalance(rpc,row.address.toLowerCase(),tag(head.number)),block:head.number
  }));
  const checkedAt=Date.now();
  if(ownership.balance<VAULT_MINIMUM){
    await db.prepare('DELETE FROM lammb_vault_wallets WHERE browser_hash=? AND session_hash=?').bind(browserHash,sessionHash).run();
    return {address:row.address.toLowerCase(),...ownership,eligible:false,checkedAt};
  }
  const member=await load();
  if(!await lookup())throw expired();
  return {address:row.address.toLowerCase(),...ownership,eligible:true,checkedAt,member};
}
export async function disconnectVault({db,origin,browser}:Context){
  const hash=await tokenHash('browser',browser);
  await db.prepare('DELETE FROM lammb_vault_wallets WHERE browser_hash=? AND origin=?').bind(hash,origin).run();
}
